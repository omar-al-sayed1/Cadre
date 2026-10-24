import { asJson, db } from "@repo/database";
import { jobQueue } from "@repo/queue";
import { AppError, logger } from "@repo/shared";
import { getStorage } from "@repo/storage";
import {
  parseCompanySettings,
  privacyDeletionSchema,
  type PrivacyDeletionInput,
} from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";

interface DeletionScope {
  candidate: boolean;
  resume: boolean;
  transcript: boolean;
  audio: boolean;
  evaluation: boolean;
}

/** Request deletion of a candidate's data (spec §75). Executed by a background job. */
export async function requestCandidateDeletion(
  ctx: ActorContext,
  candidateId: string,
  rawInput: PrivacyDeletionInput,
) {
  requirePermission(ctx, "privacy.manage");
  const input = privacyDeletionSchema.parse(rawInput);
  const candidate = await db.candidate.findFirst({
    where: { id: candidateId, companyId: ctx.companyId },
  });
  if (!candidate) throw new AppError("NOT_FOUND", { message: "Candidate not found." });
  const request = await db.$transaction(async (tx) => {
    const created = await tx.dataDeletionRequest.create({
      data: {
        companyId: ctx.companyId,
        candidateId,
        requestedById: ctx.userId,
        scope: asJson(input.scope),
      },
    });
    await jobQueue.enqueue(
      "privacy.delete",
      { requestId: created.id },
      { tx, uniqueKey: `privacy:${created.id}` },
    );
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.privacyDeletionRequested,
        entityType: "candidate",
        entityId: candidateId,
        metadata: { scope: input.scope },
      },
      tx,
    );
    return created;
  });
  return request;
}

async function deleteStoredFiles(keys: string[]): Promise<void> {
  const storage = getStorage();
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (error) {
      logger.warn("privacy.file_delete_failed", { error });
    }
  }
}

/** Erase the selected categories of a candidate's data. Idempotent. */
export async function eraseCandidateData(candidateId: string, scope: DeletionScope): Promise<void> {
  const sessions = await db.interviewSession.findMany({
    where: { candidateId },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  if (scope.resume || scope.candidate) {
    const resumes = await db.candidateResume.findMany({
      where: { candidateId },
      select: { storageKey: true },
    });
    await deleteStoredFiles(resumes.map((r) => r.storageKey));
    await db.candidateResume.deleteMany({ where: { candidateId } });
  }
  if (scope.audio || scope.candidate) {
    const recordings = await db.recording.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { storageKey: true },
    });
    await deleteStoredFiles(recordings.map((r) => r.storageKey));
    await db.recording.deleteMany({ where: { sessionId: { in: sessionIds } } });
  }
  if (scope.evaluation || scope.candidate) {
    await db.interviewEvaluation.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await db.questionEvaluation.deleteMany({ where: { sessionId: { in: sessionIds } } });
  }
  if (scope.transcript || scope.candidate) {
    await db.candidateAnswer.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await db.interviewMessage.updateMany({
      where: { sessionId: { in: sessionIds } },
      data: { content: "[deleted]", metadata: asJson({}) },
    });
    await db.interviewSession.updateMany({
      where: { id: { in: sessionIds } },
      data: { engineState: asJson({}) },
    });
  }
  if (scope.candidate) {
    await db.recruiterNote.deleteMany({ where: { candidateId } });
    await db.consentRecord.updateMany({
      where: { candidateId },
      data: { ipHash: null, userAgent: null },
    });
    await db.candidate.update({
      where: { id: candidateId },
      data: {
        firstName: "Deleted",
        lastName: "candidate",
        email: `deleted+${candidateId}@invalid.local`,
        phone: null,
        linkedinUrl: null,
        location: null,
        anonymizedAt: new Date(),
        deletedAt: new Date(),
      },
    });
  }
}

export async function processDeletionRequest(requestId: string): Promise<void> {
  const request = await db.dataDeletionRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status === "COMPLETED" || !request.candidateId) return;
  await db.dataDeletionRequest.update({ where: { id: requestId }, data: { status: "PROCESSING" } });
  try {
    const scope = privacyDeletionSchema.shape.scope.parse(request.scope);
    await eraseCandidateData(request.candidateId, scope);
    await db.dataDeletionRequest.update({
      where: { id: requestId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await audit(
      { system: true, companyId: request.companyId },
      {
        action: AUDIT_ACTIONS.privacyDeletionCompleted,
        entityType: "candidate",
        entityId: request.candidateId,
        metadata: { requestId },
      },
    );
  } catch (error) {
    await db.dataDeletionRequest.update({
      where: { id: requestId },
      data: { status: "FAILED", error: String(error).slice(0, 500) },
    });
    throw error;
  }
}

/** Apply each company's retention policy (spec §75). */
export async function runRetentionSweep(): Promise<{ candidates: number }> {
  const companies = await db.company.findMany({
    where: { deletedAt: null },
    select: { id: true, settings: true },
  });
  let erased = 0;
  for (const company of companies) {
    const { retentionDays } = parseCompanySettings(company.settings);
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const stale = await db.candidate.findMany({
      where: {
        companyId: company.id,
        anonymizedAt: null,
        updatedAt: { lt: cutoff },
        applications: { every: { updatedAt: { lt: cutoff } } },
        sessions: {
          every: { OR: [{ endedAt: { lt: cutoff } }, { status: { in: ["EXPIRED", "FAILED"] } }] },
        },
      },
      select: { id: true },
      take: 200,
    });
    for (const candidate of stale) {
      await eraseCandidateData(candidate.id, {
        candidate: true,
        resume: true,
        transcript: true,
        audio: true,
        evaluation: true,
      });
      erased += 1;
    }
    if (stale.length > 0) {
      await audit(
        { system: true, companyId: company.id },
        {
          action: AUDIT_ACTIONS.retentionSweep,
          entityType: "company",
          entityId: company.id,
          metadata: { erased: stale.length, retentionDays },
        },
      );
    }
  }
  return { candidates: erased };
}
