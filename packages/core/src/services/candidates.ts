import { LIMITS } from "@repo/config";
import { db, isUniqueConstraintError, Prisma } from "@repo/database";
import { AppError } from "@repo/shared";
import {
  candidateCsvRowSchema,
  candidateListQuerySchema,
  createCandidateSchema,
  formatZodError,
  manualRatingSchema,
  updateCandidateSchema,
  updateStageSchema,
  type CandidateListQuery,
  type CreateCandidateInput,
  type UpdateCandidateInput,
  type UpdateStageInput,
} from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { CANDIDATE_HEADER_ALIASES, parseCsv } from "../utils/csv";

async function assertJob(ctx: ActorContext, jobId: string) {
  const job = await db.job.findFirst({
    where: { id: jobId, companyId: ctx.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!job) throw new AppError("NOT_FOUND", { message: "Job not found." });
}

export async function createCandidate(ctx: ActorContext, rawInput: CreateCandidateInput) {
  requirePermission(ctx, "candidate.write");
  const input = createCandidateSchema.parse(rawInput);
  if (input.jobId) await assertJob(ctx, input.jobId);
  try {
    return await db.$transaction(async (tx) => {
      const candidate = await tx.candidate.create({
        data: {
          companyId: ctx.companyId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          linkedinUrl: input.linkedinUrl,
          location: input.location,
          source: input.source ?? "manual",
          createdById: ctx.userId,
        },
      });
      if (input.jobId)
        await tx.application.create({ data: { candidateId: candidate.id, jobId: input.jobId } });
      await audit(
        ctx,
        { action: AUDIT_ACTIONS.candidateCreated, entityType: "candidate", entityId: candidate.id },
        tx,
      );
      return candidate;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await db.candidate.findUnique({
        where: { companyId_email: { companyId: ctx.companyId, email: input.email } },
        select: { id: true },
      });
      throw new AppError("CONFLICT", {
        message: "A candidate with this email already exists.",
        expose: { candidateId: existing?.id },
      });
    }
    throw error;
  }
}

/** Find a candidate by email or create one (used by invitations and CSV import). */
export async function upsertCandidate(
  ctx: ActorContext,
  input: ReturnType<typeof createCandidateSchema.parse>,
) {
  const existing = await db.candidate.findUnique({
    where: { companyId_email: { companyId: ctx.companyId, email: input.email } },
  });
  if (existing && !existing.deletedAt) return { candidate: existing, created: false };
  if (existing?.deletedAt)
    throw new AppError("CONFLICT", {
      message: "This candidate was deleted and can't be re-added with the same email.",
    });
  const candidate = await db.candidate.create({
    data: {
      companyId: ctx.companyId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      linkedinUrl: input.linkedinUrl,
      location: input.location,
      source: input.source ?? "manual",
      createdById: ctx.userId,
    },
  });
  return { candidate, created: true };
}

export async function updateCandidate(
  ctx: ActorContext,
  candidateId: string,
  rawInput: UpdateCandidateInput,
) {
  requirePermission(ctx, "candidate.write");
  const input = updateCandidateSchema.parse(rawInput);
  await getCandidateRecord(ctx, candidateId);
  const candidate = await db.candidate.update({ where: { id: candidateId }, data: input });
  await audit(ctx, {
    action: AUDIT_ACTIONS.candidateUpdated,
    entityType: "candidate",
    entityId: candidateId,
    metadata: { fields: Object.keys(rawInput) },
  });
  return candidate;
}

async function getCandidateRecord(ctx: ActorContext, candidateId: string) {
  const candidate = await db.candidate.findFirst({
    where: { id: candidateId, companyId: ctx.companyId, deletedAt: null },
  });
  if (!candidate) throw new AppError("NOT_FOUND", { message: "Candidate not found." });
  return candidate;
}

export async function attachCandidateToJob(ctx: ActorContext, candidateId: string, jobId: string) {
  requirePermission(ctx, "candidate.write");
  await getCandidateRecord(ctx, candidateId);
  await assertJob(ctx, jobId);
  return db.application.upsert({
    where: { candidateId_jobId: { candidateId, jobId } },
    update: {},
    create: { candidateId, jobId },
  });
}

export interface CsvImportResult {
  created: number;
  existing: number;
  errors: Array<{ row: number; errors: Record<string, string[]> }>;
}

export async function importCandidatesCsv(
  ctx: ActorContext,
  csvText: string,
  jobId?: string,
): Promise<CsvImportResult> {
  requirePermission(ctx, "candidate.write");
  if (jobId) await assertJob(ctx, jobId);
  const { rows } = parseCsv(csvText);
  if (rows.length === 0)
    throw new AppError("VALIDATION_FAILED", { message: "The CSV file has no data rows." });
  if (rows.length > LIMITS.candidateCsv.maxRows) {
    throw new AppError("VALIDATION_FAILED", {
      message: `Import at most ${LIMITS.candidateCsv.maxRows} candidates at a time.`,
    });
  }
  const result: CsvImportResult = { created: 0, existing: 0, errors: [] };
  for (const [index, raw] of rows.entries()) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw))
      normalized[CANDIDATE_HEADER_ALIASES[key] ?? key] = value;
    const parsed = candidateCsvRowSchema.safeParse(normalized);
    if (!parsed.success) {
      result.errors.push({ row: index + 2, errors: formatZodError(parsed.error) });
      continue;
    }
    const row = parsed.data;
    const { candidate, created } = await upsertCandidate(
      ctx,
      createCandidateSchema.parse({
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        linkedinUrl: row.linkedin,
        location: row.location,
        source: "csv",
      }),
    );
    if (created) result.created += 1;
    else result.existing += 1;
    if (jobId) {
      await db.application.upsert({
        where: { candidateId_jobId: { candidateId: candidate.id, jobId } },
        update: {},
        create: { candidateId: candidate.id, jobId },
      });
    }
  }
  await audit(ctx, {
    action: AUDIT_ACTIONS.candidateImported,
    entityType: "candidate",
    metadata: {
      created: result.created,
      existing: result.existing,
      errors: result.errors.length,
      jobId,
    },
  });
  return result;
}

const SORTS: Record<CandidateListQuery["sort"], Prisma.Sql> = {
  newest: Prisma.sql`a."createdAt" DESC`,
  oldest: Prisma.sql`a."createdAt" ASC`,
  score_desc: Prisma.sql`score DESC NULLS LAST, a."createdAt" DESC`,
  score_asc: Prisma.sql`score ASC NULLS LAST, a."createdAt" DESC`,
  name: Prisma.sql`c."lastName" ASC, c."firstName" ASC`,
};

export interface CandidateListRow {
  applicationId: string;
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  jobId: string;
  jobTitle: string;
  stage: string;
  sessionId: string | null;
  sessionStatus: string | null;
  interviewedAt: Date | null;
  score: number | null;
  recommendation: string | null;
  confidenceLevel: string | null;
  evaluationStatus: string | null;
  manualRating: number | null;
  createdAt: Date;
}

/**
 * Candidate pipeline list (one row per application) with filters, search and
 * sorting (spec §70). Uses the latest session/evaluation per application.
 */
export async function listCandidates(
  ctx: ActorContext,
  rawQuery: Partial<Record<keyof CandidateListQuery, unknown>> = {},
) {
  requirePermission(ctx, "candidate.read");
  const q = candidateListQuerySchema.parse(rawQuery);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`c."companyId" = ${ctx.companyId}`,
    Prisma.sql`c."deletedAt" IS NULL`,
    Prisma.sql`j."deletedAt" IS NULL`,
  ];
  if (q.jobId) conditions.push(Prisma.sql`a."jobId" = ${q.jobId}`);
  if (q.stage) conditions.push(Prisma.sql`a."stage" = ${q.stage}::"CandidateStage"`);
  if (q.recommendation)
    conditions.push(
      Prisma.sql`COALESCE(e."overriddenRecommendation", e."recommendation") = ${q.recommendation}::"Recommendation"`,
    );
  if (q.minScore !== undefined)
    conditions.push(Prisma.sql`COALESCE(e."overriddenScore", e."overallScore") >= ${q.minScore}`);
  if (q.maxScore !== undefined)
    conditions.push(Prisma.sql`COALESCE(e."overriddenScore", e."overallScore") <= ${q.maxScore}`);
  if (q.interviewedFrom) conditions.push(Prisma.sql`s."endedAt" >= ${q.interviewedFrom}`);
  if (q.interviewedTo) conditions.push(Prisma.sql`s."endedAt" <= ${q.interviewedTo}`);
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(
      Prisma.sql`(c."firstName" ILIKE ${like} OR c."lastName" ILIKE ${like} OR c."email" ILIKE ${like} OR (c."firstName" || ' ' || c."lastName") ILIKE ${like})`,
    );
  }
  const where = Prisma.join(conditions, " AND ");
  const base = Prisma.sql`
    FROM "application" a
    JOIN "candidate" c ON c."id" = a."candidateId"
    JOIN "job" j ON j."id" = a."jobId"
    LEFT JOIN LATERAL (
      SELECT s2.* FROM "interview_session" s2 WHERE s2."applicationId" = a."id" AND s2."deletedAt" IS NULL
      ORDER BY s2."createdAt" DESC LIMIT 1
    ) s ON true
    LEFT JOIN "interview_evaluation" e ON e."sessionId" = s."id"
    WHERE ${where}`;
  const [rows, countRows] = await Promise.all([
    db.$queryRaw<CandidateListRow[]>`
      SELECT a."id" AS "applicationId", c."id" AS "candidateId", c."firstName", c."lastName", c."email",
             j."id" AS "jobId", j."title" AS "jobTitle", a."stage"::text AS "stage", a."manualRating",
             s."id" AS "sessionId", s."status"::text AS "sessionStatus", s."endedAt" AS "interviewedAt",
             COALESCE(e."overriddenScore", e."overallScore") AS score,
             COALESCE(e."overriddenRecommendation", e."recommendation")::text AS recommendation,
             e."confidenceLevel"::text AS "confidenceLevel", e."status"::text AS "evaluationStatus", a."createdAt"
      ${base}
      ORDER BY ${SORTS[q.sort]}
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count ${base}`,
  ]);
  return {
    items: rows,
    total: Number(countRows[0]?.count ?? 0),
    page: q.page,
    pageSize: q.pageSize,
  };
}

export async function getCandidate(ctx: ActorContext, candidateId: string) {
  requirePermission(ctx, "candidate.read");
  const candidate = await db.candidate.findFirst({
    where: { id: candidateId, companyId: ctx.companyId, deletedAt: null },
    include: {
      resumes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      applications: {
        include: {
          job: { select: { id: true, title: true, status: true } },
          invitations: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              expiresAt: true,
              attemptCount: true,
              maxAttempts: true,
              sendCount: true,
              lastSentAt: true,
              createdAt: true,
              template: { select: { id: true, name: true } },
            },
          },
          sessions: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              startedAt: true,
              endedAt: true,
              completionReason: true,
              questionsAsked: true,
              evaluation: {
                select: {
                  status: true,
                  overallScore: true,
                  overriddenScore: true,
                  recommendation: true,
                  overriddenRecommendation: true,
                  confidenceLevel: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!candidate) throw new AppError("NOT_FOUND", { message: "Candidate not found." });
  return candidate;
}

export async function updateApplicationStage(
  ctx: ActorContext,
  applicationId: string,
  rawInput: UpdateStageInput,
) {
  requirePermission(ctx, "stage.update");
  const input = updateStageSchema.parse(rawInput);
  const application = await db.application.findFirst({
    where: { id: applicationId, job: { companyId: ctx.companyId } },
  });
  if (!application) throw new AppError("NOT_FOUND", { message: "Application not found." });
  const updated = await db.application.update({
    where: { id: applicationId },
    data: { stage: input.stage, stageUpdatedAt: new Date() },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.candidateStageChanged,
    entityType: "application",
    entityId: applicationId,
    metadata: { from: application.stage, to: input.stage, reason: input.reason },
  });
  return updated;
}

export async function rateApplication(
  ctx: ActorContext,
  applicationId: string,
  rawInput: { rating: number | null },
) {
  requirePermission(ctx, "stage.update");
  const { rating } = manualRatingSchema.parse(rawInput);
  const application = await db.application.findFirst({
    where: { id: applicationId, job: { companyId: ctx.companyId } },
  });
  if (!application) throw new AppError("NOT_FOUND", { message: "Application not found." });
  await db.application.update({ where: { id: applicationId }, data: { manualRating: rating } });
  await audit(ctx, {
    action: AUDIT_ACTIONS.candidateRated,
    entityType: "application",
    entityId: applicationId,
    metadata: { rating },
  });
}
