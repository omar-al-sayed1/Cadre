import { db } from "@repo/database";
import {
  candidateCompletedEmail,
  invitationExpiredEmail,
  recruiterCompletedEmail,
  reminderEmail,
} from "@repo/email";
import { templateSnapshotSchema } from "@repo/interview-engine/snapshot";
import { jobQueue } from "@repo/queue";
import { logger } from "@repo/shared";
import { generateSecureToken, hashToken } from "@repo/shared/server";
import { parseCompanySettings } from "@repo/validation";
import { notifyCompanyMembers } from "../notifications";
import { appUrl } from "../runtime";
import { interviewUrl } from "./invitations";

/** After an interview completes: candidate confirmation + recruiter notifications (spec §68). */
export async function handleInterviewCompleted(sessionId: string): Promise<void> {
  const session = await db.interviewSession.findUnique({
    where: { id: sessionId },
    include: {
      candidate: true,
      company: true,
      templateVersion: true,
      invitation: { include: { createdBy: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!session || session.status !== "COMPLETED") return;
  const snapshot = templateSnapshotSchema.parse(session.templateVersion.snapshot);
  const settings = parseCompanySettings(session.company.settings);
  const candidateName = `${session.candidate.firstName} ${session.candidate.lastName}`.trim();

  if (settings.notifications.candidateCompletion && !session.candidate.deletedAt) {
    const email = candidateCompletedEmail({
      candidateFirstName: session.candidate.firstName,
      jobTitle: snapshot.job.title,
      companyName: session.company.name,
      brandColor: session.company.primaryColor,
    });
    await jobQueue.enqueue(
      "email.send",
      {
        to: session.candidate.email,
        ...email,
        companyId: session.companyId,
        idempotencyKey: `completed:${sessionId}`,
      },
      { uniqueKey: `email:completed:${sessionId}` },
    );
  }

  await notifyCompanyMembers({
    companyId: session.companyId,
    type: "INTERVIEW_COMPLETED",
    title: `${candidateName} completed their interview`,
    body: snapshot.job.title,
    link: `/interviews/${sessionId}`,
    dedupeKey: `interview-completed:${sessionId}`,
    roles: ["COMPANY_ADMIN", "RECRUITER", "HIRING_MANAGER"],
  });

  const recruiter = session.invitation.createdBy;
  if (settings.notifications.recruiterCompletion && recruiter) {
    const email = recruiterCompletedEmail({
      recruiterName: recruiter.name,
      candidateName,
      jobTitle: snapshot.job.title,
      reportUrl: appUrl(`/interviews/${sessionId}`),
      companyName: session.company.name,
    });
    await jobQueue.enqueue(
      "email.send",
      {
        to: recruiter.email,
        ...email,
        companyId: session.companyId,
        idempotencyKey: `recruiter-completed:${sessionId}`,
      },
      { uniqueKey: `email:recruiter-completed:${sessionId}` },
    );
  }
}

/**
 * Reminder emails before invitation expiry (spec §69). Reminders need a working
 * link, so the token is rotated; the unique job key prevents duplicate sends.
 */
export async function sendInvitationReminders(): Promise<number> {
  const now = Date.now();
  const invitations = await db.interviewInvitation.findMany({
    where: {
      status: { in: ["PENDING", "OPENED"] },
      expiresAt: { gt: new Date(now), lt: new Date(now + 25 * 3_600_000) },
    },
    include: {
      candidate: true,
      templateVersion: true,
      template: { include: { job: { include: { company: true } } } },
    },
    take: 500,
  });
  let sent = 0;
  for (const invitation of invitations) {
    const company = invitation.template.job.company;
    const settings = parseCompanySettings(company.settings);
    if (!settings.notifications.candidateReminders || invitation.candidate.deletedAt) continue;
    const hoursLeft = (invitation.expiresAt.getTime() - now) / 3_600_000;
    const due = [...settings.reminderHoursBeforeExpiry]
      .sort((a, b) => a - b)
      .find((h) => hoursLeft <= h);
    if (due === undefined) continue;
    const uniqueKey = `email:reminder:${invitation.id}:${due}h`;
    const already = await db.backgroundJob.findUnique({
      where: { uniqueKey },
      select: { id: true },
    });
    if (already) continue;
    const token = generateSecureToken();
    const snapshot = templateSnapshotSchema.parse(invitation.templateVersion.snapshot);
    const email = reminderEmail({
      candidateFirstName: invitation.candidate.firstName,
      jobTitle: snapshot.job.title,
      companyName: company.name,
      durationMinutes: snapshot.durationMinutes,
      expiresAt: invitation.expiresAt,
      interviewUrl: interviewUrl(token),
      timezone: company.timezone,
      brandColor: company.primaryColor,
      hoursLeft: Math.max(1, Math.round(hoursLeft)),
    });
    await db.$transaction(async (tx) => {
      await tx.interviewInvitation.update({
        where: { id: invitation.id },
        data: { tokenHash: hashToken(token) },
      });
      await jobQueue.enqueue(
        "email.send",
        {
          to: invitation.candidate.email,
          ...email,
          companyId: company.id,
          idempotencyKey: uniqueKey,
        },
        { tx, uniqueKey },
      );
    });
    sent += 1;
  }
  if (sent > 0) logger.info("reminders.sent", { count: sent });
  return sent;
}

/** Mark expired invitations and notify candidates once (spec §68). */
export async function expireInvitations(): Promise<number> {
  const expired = await db.interviewInvitation.findMany({
    where: { status: { in: ["PENDING", "OPENED"] }, expiresAt: { lte: new Date() } },
    include: {
      candidate: true,
      templateVersion: true,
      template: { include: { job: { include: { company: true } } } },
    },
    take: 500,
  });
  for (const invitation of expired) {
    const company = invitation.template.job.company;
    const snapshot = templateSnapshotSchema.parse(invitation.templateVersion.snapshot);
    await db.$transaction(async (tx) => {
      const updated = await tx.interviewInvitation.updateMany({
        where: { id: invitation.id, status: { in: ["PENDING", "OPENED"] } },
        data: { status: "EXPIRED" },
      });
      if (updated.count === 0) return;
      await tx.application.updateMany({
        where: { id: invitation.applicationId, stage: { in: ["INVITED", "OPENED"] } },
        data: { stage: "EXPIRED", stageUpdatedAt: new Date() },
      });
      if (
        !invitation.candidate.deletedAt &&
        parseCompanySettings(company.settings).notifications.candidateInvitation
      ) {
        const email = invitationExpiredEmail({
          candidateFirstName: invitation.candidate.firstName,
          jobTitle: snapshot.job.title,
          companyName: company.name,
        });
        await jobQueue.enqueue(
          "email.send",
          {
            to: invitation.candidate.email,
            ...email,
            companyId: company.id,
            idempotencyKey: `expired:${invitation.id}`,
          },
          { tx, uniqueKey: `email:expired:${invitation.id}` },
        );
      }
    });
  }
  return expired.length;
}
