import { LIMITS } from "@repo/config";
import { asJson, db } from "@repo/database";
import { parsedResumeSchema, type ParsedResume } from "@repo/ai";
import { jobQueue } from "@repo/queue";
import { AppError, logger } from "@repo/shared";
import { getStorage, sanitizeFilename, storageKey, validateUpload } from "@repo/storage";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { isFeatureEnabled } from "../feature-flags";
import { getInterviewAI } from "../runtime";

export async function uploadResume(
  ctx: ActorContext,
  candidateId: string,
  bytes: Uint8Array,
  originalFilename: string,
) {
  requirePermission(ctx, "candidate.write");
  const candidate = await db.candidate.findFirst({
    where: { id: candidateId, companyId: ctx.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!candidate) throw new AppError("NOT_FOUND", { message: "Candidate not found." });
  const check = validateUpload(bytes, {
    maxBytes: LIMITS.resume.maxBytes,
    allowedTypes: LIMITS.resume.allowedMimeTypes,
  });
  if (!check.ok)
    throw new AppError(check.code, {
      message:
        check.message === "This file type isn't supported."
          ? "Upload a PDF or DOCX resume."
          : check.message,
    });

  const key = storageKey(`companies/${ctx.companyId}/resumes`, check.extension);
  await getStorage().put({ key, body: bytes, contentType: check.type });
  const parsingEnabled = await isFeatureEnabled(ctx.companyId, "resumeParsing");
  const resume = await db.$transaction(async (tx) => {
    const created = await tx.candidateResume.create({
      data: {
        candidateId,
        storageKey: key,
        originalFilename: sanitizeFilename(originalFilename),
        mimeType: check.type,
        sizeBytes: bytes.byteLength,
        parseStatus: parsingEnabled ? "PENDING" : "FAILED",
        parseError: parsingEnabled ? null : "Resume parsing is disabled for this workspace.",
        uploadedById: ctx.userId,
      },
    });
    if (parsingEnabled)
      await jobQueue.enqueue(
        "resume.parse",
        { resumeId: created.id },
        { tx, uniqueKey: `resume.parse:${created.id}` },
      );
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.resumeUploaded,
        entityType: "candidate_resume",
        entityId: created.id,
        metadata: { candidateId },
      },
      tx,
    );
    return created;
  });
  return resume;
}

export async function extractResumeText(bytes: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

/** Background job: extract text and parse a resume into structured data. */
export async function parseResumeJob(resumeId: string): Promise<void> {
  const resume = await db.candidateResume.findUnique({
    where: { id: resumeId },
    include: { candidate: { select: { companyId: true } } },
  });
  if (!resume || resume.deletedAt) return;
  if (resume.parseStatus === "COMPLETED") return; // idempotent
  await db.candidateResume.update({ where: { id: resumeId }, data: { parseStatus: "PROCESSING" } });
  try {
    const file = await getStorage().get(resume.storageKey);
    if (!file) throw new Error("Resume file missing from storage");
    const text = (await extractResumeText(file.body, resume.mimeType)).trim();
    if (text.length < 20)
      throw new Error("No readable text found in the resume (it may be a scanned image).");
    const result = await getInterviewAI().parseResume(
      { text },
      { companyId: resume.candidate.companyId },
    );
    const parsed: ParsedResume = parsedResumeSchema.parse(result.data);
    await db.candidateResume.update({
      where: { id: resumeId },
      data: {
        parseStatus: "COMPLETED",
        parsedData: asJson(parsed),
        parsedAt: new Date(),
        parseError: null,
        promptVersion: result.promptVersion,
      },
    });
  } catch (error) {
    logger.warn("resume.parse_failed", { resumeId, error });
    await db.candidateResume.update({
      where: { id: resumeId },
      data: {
        parseStatus: "FAILED",
        parseError: error instanceof Error ? error.message.slice(0, 500) : "Parsing failed",
      },
    });
    throw error;
  }
}

export async function getResumeFile(ctx: ActorContext, resumeId: string) {
  requirePermission(ctx, "candidate.read");
  const resume = await db.candidateResume.findFirst({
    where: { id: resumeId, deletedAt: null, candidate: { companyId: ctx.companyId } },
  });
  if (!resume) throw new AppError("NOT_FOUND", { message: "Resume not found." });
  const file = await getStorage().get(resume.storageKey);
  if (!file) throw new AppError("NOT_FOUND", { message: "Resume file not found." });
  return { file, resume };
}

/** Latest successfully parsed resume for a candidate, or null. */
export async function latestParsedResume(candidateId: string): Promise<ParsedResume | null> {
  const resume = await db.candidateResume.findFirst({
    where: { candidateId, deletedAt: null, parseStatus: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { parsedData: true },
  });
  if (!resume?.parsedData) return null;
  const parsed = parsedResumeSchema.safeParse(resume.parsedData);
  return parsed.success ? parsed.data : null;
}
