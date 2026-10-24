import { getEmailProvider } from "@repo/email";
import { PermanentJobError, type JobHandlers } from "@repo/queue";
import { cleanupRateLimits } from "../rate-limit";
import { expireAbandonedSessions } from "../services/candidate-session";
import { runFinalEvaluation } from "../services/evaluation";
import {
  expireInvitations,
  handleInterviewCompleted,
  sendInvitationReminders,
} from "../services/lifecycle";
import { processDeletionRequest, runRetentionSweep } from "../services/privacy";
import { parseResumeJob } from "../services/resumes";
import { rescoreCompanyLeads } from "../services/sales/leads";
import { runLeadResearch } from "../services/sales/research";
import { runDiscovery } from "../services/sales/discovery";
import { db } from "@repo/database";

/**
 * Background job handlers (spec §87). Every handler is idempotent: re-running a
 * job after a crash or retry never duplicates its effects.
 */
export const jobHandlers: JobHandlers = {
  "interview.evaluate": async (payload, ctx) => {
    ctx.logger.info("evaluation.started", { sessionId: payload.sessionId });
    await runFinalEvaluation(payload.sessionId, { force: payload.force });
  },
  "interview.post-completion": async (payload) => {
    await handleInterviewCompleted(payload.sessionId);
  },
  "resume.parse": async (payload, ctx) => {
    try {
      await parseResumeJob(payload.resumeId);
    } catch (error) {
      // Unreadable files won't become readable on retry.
      if (error instanceof Error && /No readable text|missing from storage/.test(error.message))
        throw new PermanentJobError(error.message);
      if (ctx.attempt >= 3)
        throw new PermanentJobError(
          error instanceof Error ? error.message : "Resume parsing failed",
        );
      throw error;
    }
  },
  "email.send": async (payload) => {
    await getEmailProvider().send({
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      idempotencyKey: payload.idempotencyKey,
    });
  },
  "invitations.send-reminders": async (_payload, ctx) => {
    const sent = await sendInvitationReminders();
    ctx.logger.info("reminders.done", { sent });
  },
  "invitations.expire": async () => {
    await expireInvitations();
  },
  "sessions.expire-abandoned": async () => {
    await expireAbandonedSessions();
  },
  "retention.sweep": async (_payload, ctx) => {
    const result = await runRetentionSweep();
    ctx.logger.info("retention.done", result);
  },
  "privacy.delete": async (payload) => {
    await processDeletionRequest(payload.requestId);
  },
  "maintenance.cleanup": async () => {
    await cleanupRateLimits();
    // Keep completed job rows for 14 days for observability.
    await db.backgroundJob.deleteMany({
      where: { status: "COMPLETED", completedAt: { lt: new Date(Date.now() - 14 * 86_400_000) } },
    });
  },
  "sales.rescore-leads": async (payload, ctx) => {
    const result = await rescoreCompanyLeads(payload.companyId);
    ctx.logger.info("sales.rescored", result);
  },
  "sales.research-lead": async (payload, ctx) => {
    const result = await runLeadResearch(payload.researchId);
    ctx.logger.info("sales.researched", { researchId: payload.researchId, status: result.status });
  },
  "sales.discover-leads": async (payload, ctx) => {
    const result = await runDiscovery(payload.runId);
    ctx.logger.info("sales.discovered", {
      runId: payload.runId,
      status: result.status,
      found: result.candidates.length,
    });
  },
};
