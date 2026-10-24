import { db, type TransactionClient } from "@repo/database";
import { invitationEmail } from "@repo/email";
import { templateSnapshotSchema } from "@repo/interview-engine/snapshot";
import { jobQueue } from "@repo/queue";
import { addDays, AppError } from "@repo/shared";
import { generateSecureToken, hashToken, looksLikeToken } from "@repo/shared/server";
import {
  createInvitationSchema,
  createCandidateSchema,
  parseCompanySettings,
  type CreateInvitationInput,
} from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { appUrl } from "../runtime";
import { upsertCandidate } from "./candidates";
import { assertEntitled } from "./subscriptions";

export function interviewUrl(token: string): string {
  return appUrl(`/i/${token}`);
}

async function enqueueInvitationEmail(
  tx: TransactionClient,
  data: { invitationId: string; sendCount: number; token: string; companyId: string },
): Promise<void> {
  const invitation = await tx.interviewInvitation.findUniqueOrThrow({
    where: { id: data.invitationId },
    include: {
      candidate: true,
      templateVersion: true,
      template: { include: { job: { include: { company: true } } } },
    },
  });
  const snapshot = templateSnapshotSchema.parse(invitation.templateVersion.snapshot);
  const company = invitation.template.job.company;
  const settings = parseCompanySettings(company.settings);
  if (!settings.notifications.candidateInvitation) return;
  const email = invitationEmail({
    candidateFirstName: invitation.candidate.firstName,
    jobTitle: snapshot.job.title,
    companyName: company.name,
    durationMinutes: snapshot.durationMinutes,
    expiresAt: invitation.expiresAt,
    interviewUrl: interviewUrl(data.token),
    timezone: company.timezone,
    brandColor: company.primaryColor,
    welcomeText: company.welcomeText,
  });
  const key = `invitation:${invitation.id}:${data.sendCount}`;
  await jobQueue.enqueue(
    "email.send",
    { to: invitation.candidate.email, ...email, companyId: data.companyId, idempotencyKey: key },
    { tx, uniqueKey: `email:${key}` },
  );
}

/**
 * Invite a candidate (existing or new) to a published interview. Creates the
 * candidate, application and invitation atomically (spec §86).
 * The raw token is returned once so the recruiter can copy the link; only its hash is stored.
 */
export async function createInvitation(ctx: ActorContext, rawInput: CreateInvitationInput) {
  requirePermission(ctx, "invitation.send");
  await assertEntitled(ctx.companyId, "interviewer");
  const input = createInvitationSchema.parse(rawInput);
  const template = await db.interviewTemplate.findFirst({
    where: { id: input.templateId, companyId: ctx.companyId, deletedAt: null },
    include: { job: true },
  });
  if (!template) throw new AppError("NOT_FOUND", { message: "Interview not found." });
  if (template.status !== "PUBLISHED" || template.publishedVersion === 0) {
    throw new AppError("CONFLICT", {
      message: "Publish the interview before inviting candidates.",
    });
  }
  if (["CLOSED", "ARCHIVED"].includes(template.job.status) || template.job.deletedAt) {
    throw new AppError("CONFLICT", {
      message: "This job is closed. Reopen it to invite candidates.",
    });
  }
  const version = await db.interviewTemplateVersion.findFirstOrThrow({
    where: { templateId: template.id },
    orderBy: { version: "desc" },
  });

  let candidateId = input.candidateId;
  if (!candidateId && input.candidate) {
    const { candidate } = await upsertCandidate(
      ctx,
      createCandidateSchema.parse({
        ...input.candidate,
        source: input.candidate.source ?? "invitation",
      }),
    );
    candidateId = candidate.id;
  }
  const candidate = await db.candidate.findFirst({
    where: { id: candidateId, companyId: ctx.companyId, deletedAt: null },
  });
  if (!candidate) throw new AppError("NOT_FOUND", { message: "Candidate not found." });

  const token = generateSecureToken();
  const invitation = await db.$transaction(async (tx) => {
    const application = await tx.application.upsert({
      where: { candidateId_jobId: { candidateId: candidate.id, jobId: template.jobId } },
      update: { stage: "INVITED", stageUpdatedAt: new Date() },
      create: { candidateId: candidate.id, jobId: template.jobId, stage: "INVITED" },
    });
    // A new invitation supersedes any pending ones for the same application.
    await tx.interviewInvitation.updateMany({
      where: { applicationId: application.id, status: { in: ["PENDING", "OPENED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    const created = await tx.interviewInvitation.create({
      data: {
        applicationId: application.id,
        candidateId: candidate.id,
        templateId: template.id,
        templateVersionId: version.id,
        tokenHash: hashToken(token),
        expiresAt: addDays(new Date(), input.expiresInDays),
        maxAttempts: input.maxAttempts,
        createdById: ctx.userId,
        sendCount: input.sendEmail ? 1 : 0,
        lastSentAt: input.sendEmail ? new Date() : null,
      },
    });
    if (input.sendEmail) {
      await enqueueInvitationEmail(tx, {
        invitationId: created.id,
        sendCount: 1,
        token,
        companyId: ctx.companyId,
      });
    }
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.invitationCreated,
        entityType: "interview_invitation",
        entityId: created.id,
        metadata: { templateId: template.id, version: version.version, emailed: input.sendEmail },
      },
      tx,
    );
    return created;
  });
  return { invitation, candidate, url: interviewUrl(token) };
}

async function findInvitation(ctx: ActorContext, invitationId: string) {
  const invitation = await db.interviewInvitation.findFirst({
    where: { id: invitationId, candidate: { companyId: ctx.companyId } },
  });
  if (!invitation) throw new AppError("NOT_FOUND", { message: "Invitation not found." });
  return invitation;
}

/** Resend (and/or regenerate the link for) an invitation. The previous link stops working. */
export async function resendInvitation(
  ctx: ActorContext,
  invitationId: string,
  options: { sendEmail: boolean; extendDays?: number },
) {
  requirePermission(ctx, "invitation.send");
  await assertEntitled(ctx.companyId, "interviewer");
  const existing = await findInvitation(ctx, invitationId);
  if (["COMPLETED", "CANCELLED"].includes(existing.status)) {
    throw new AppError("CONFLICT", {
      message: "This invitation can no longer be resent. Create a new invitation instead.",
    });
  }
  const token = generateSecureToken();
  const now = new Date();
  const expired = existing.expiresAt <= now || existing.status === "EXPIRED";
  const updated = await db.$transaction(async (tx) => {
    const invitation = await tx.interviewInvitation.update({
      where: { id: invitationId },
      data: {
        tokenHash: hashToken(token),
        status: expired ? "PENDING" : existing.status,
        expiresAt:
          expired || options.extendDays
            ? addDays(now, options.extendDays ?? 7)
            : existing.expiresAt,
        sendCount: options.sendEmail ? { increment: 1 } : undefined,
        lastSentAt: options.sendEmail ? now : undefined,
      },
    });
    if (expired) {
      await tx.application.update({
        where: { id: invitation.applicationId },
        data: { stage: "INVITED", stageUpdatedAt: now },
      });
    }
    if (options.sendEmail) {
      await enqueueInvitationEmail(tx, {
        invitationId,
        sendCount: invitation.sendCount,
        token,
        companyId: ctx.companyId,
      });
    }
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.invitationResent,
        entityType: "interview_invitation",
        entityId: invitationId,
        metadata: { emailed: options.sendEmail },
      },
      tx,
    );
    return invitation;
  });
  return { invitation: updated, url: interviewUrl(token) };
}

export async function cancelInvitation(ctx: ActorContext, invitationId: string): Promise<void> {
  requirePermission(ctx, "invitation.send");
  const invitation = await findInvitation(ctx, invitationId);
  if (invitation.status === "COMPLETED")
    throw new AppError("CONFLICT", { message: "Completed interviews can't be cancelled." });
  await db.$transaction(async (tx) => {
    await tx.interviewInvitation.update({
      where: { id: invitationId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await tx.interviewSession.updateMany({
      where: { invitationId, status: { notIn: ["COMPLETED", "FAILED", "EXPIRED"] } },
      data: {
        status: "FAILED",
        endedAt: new Date(),
        completionReason: "ADMIN_TERMINATED",
        failureReason: "Invitation cancelled",
      },
    });
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.invitationCancelled,
        entityType: "interview_invitation",
        entityId: invitationId,
      },
      tx,
    );
  });
}

// ───────────────────────── Public (candidate) token resolution ─────────────────────────

export type InvitationState = "VALID" | "EXPIRED" | "CANCELLED" | "COMPLETED" | "EXHAUSTED";

/**
 * Resolve a raw invitation token from a candidate link. Never reveals whether a
 * token exists beyond what the candidate needs (invalid → generic not-found).
 */
export async function resolveInvitationToken(token: string) {
  if (!looksLikeToken(token)) throw new AppError("INVITATION_INVALID");
  const invitation = await db.interviewInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      candidate: true,
      templateVersion: true,
      template: { include: { job: { include: { company: true } } } },
      sessions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!invitation || invitation.candidate.deletedAt) throw new AppError("INVITATION_INVALID");

  const snapshot = templateSnapshotSchema.parse(invitation.templateVersion.snapshot);
  const company = invitation.template.job.company;
  const latestSession = invitation.sessions[0] ?? null;
  let state: InvitationState = "VALID";
  if (invitation.status === "CANCELLED") state = "CANCELLED";
  else if (invitation.status === "COMPLETED" || latestSession?.status === "COMPLETED")
    state = "COMPLETED";
  else if (
    invitation.expiresAt <= new Date() &&
    !(latestSession && !["COMPLETED", "FAILED", "EXPIRED"].includes(latestSession.status))
  )
    state = "EXPIRED";
  else if (
    invitation.attemptCount >= invitation.maxAttempts &&
    !(latestSession && !["COMPLETED", "FAILED", "EXPIRED"].includes(latestSession.status))
  )
    state = "EXHAUSTED";

  if (state === "EXPIRED" && invitation.status !== "EXPIRED") {
    await db.$transaction([
      db.interviewInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } }),
      db.application.update({
        where: { id: invitation.applicationId },
        data: { stage: "EXPIRED", stageUpdatedAt: new Date() },
      }),
    ]);
  }
  return { invitation, snapshot, company, latestSession, state };
}

/** Mark an invitation as opened (first visit). */
export async function markInvitationOpened(
  invitationId: string,
  applicationId: string,
): Promise<void> {
  const updated = await db.interviewInvitation.updateMany({
    where: { id: invitationId, status: "PENDING" },
    data: { status: "OPENED", openedAt: new Date() },
  });
  if (updated.count > 0) {
    await db.application.updateMany({
      where: { id: applicationId, stage: "INVITED" },
      data: { stage: "OPENED", stageUpdatedAt: new Date() },
    });
  }
}
