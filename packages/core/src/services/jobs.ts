import { db, Prisma, type TransactionClient } from "@repo/database";
import { AppError, slugify } from "@repo/shared";
import {
  createJobSchema,
  jobListQuerySchema,
  updateJobSchema,
  type CreateJobInput,
  type JobListQuery,
  type JobSkillInput,
  type UpdateJobInput,
} from "@repo/validation";
import type { JobStatus } from "@repo/shared";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { assertEntitled } from "./subscriptions";

type SkillInput = Exclude<ReturnType<typeof createJobSchema.parse>["skills"], undefined>[number];

/** Resolve skill inputs (by id or by name) to company skills, creating new ones as needed. */
async function resolveSkills(tx: TransactionClient, companyId: string, skills: SkillInput[]) {
  const resolved: Array<{
    skillId: string;
    weight: number;
    expectedLevel: SkillInput["expectedLevel"];
    isCritical: boolean;
  }> = [];
  for (const input of skills) {
    let skillId = input.skillId;
    if (skillId) {
      const exists = await tx.skill.findFirst({
        where: { id: skillId, companyId },
        select: { id: true },
      });
      if (!exists) throw new AppError("VALIDATION_FAILED", { message: "Unknown skill." });
    } else {
      const name = input.name!.trim();
      const slug = slugify(name) || name.toLowerCase();
      const skill = await tx.skill.upsert({
        where: { companyId_slug: { companyId, slug } },
        update: {},
        create: { companyId, name, slug, category: input.category },
      });
      skillId = skill.id;
    }
    resolved.push({
      skillId,
      weight: input.weight,
      expectedLevel: input.expectedLevel,
      isCritical: input.isCritical,
    });
  }
  return resolved;
}

export async function createJob(ctx: ActorContext, rawInput: CreateJobInput) {
  requirePermission(ctx, "job.write");
  await assertEntitled(ctx.companyId, "interviewer");
  const input = createJobSchema.parse(rawInput);
  return db.$transaction(async (tx) => {
    const { skills, ...fields } = input;
    const job = await tx.job.create({
      data: { ...fields, companyId: ctx.companyId, createdById: ctx.userId },
    });
    const resolved = await resolveSkills(tx, ctx.companyId, skills);
    if (resolved.length > 0)
      await tx.jobSkill.createMany({ data: resolved.map((s) => ({ ...s, jobId: job.id })) });
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.jobCreated,
        entityType: "job",
        entityId: job.id,
        metadata: { title: job.title },
      },
      tx,
    );
    return job;
  });
}

async function findJobOrThrow(ctx: ActorContext, jobId: string, client: TransactionClient = db) {
  const job = await client.job.findFirst({
    where: { id: jobId, companyId: ctx.companyId, deletedAt: null },
  });
  if (!job) throw new AppError("NOT_FOUND", { message: "Job not found." });
  return job;
}

export async function updateJob(ctx: ActorContext, jobId: string, rawInput: UpdateJobInput) {
  requirePermission(ctx, "job.write");
  const input = updateJobSchema.parse(rawInput);
  return db.$transaction(async (tx) => {
    const existing = await findJobOrThrow(ctx, jobId, tx);
    const { skills, ...fields } = input;
    const job = await tx.job.update({ where: { id: jobId }, data: fields });
    if (skills) {
      const resolved = await resolveSkills(tx, ctx.companyId, skills);
      await tx.jobSkill.deleteMany({ where: { jobId } });
      if (resolved.length > 0)
        await tx.jobSkill.createMany({ data: resolved.map((s) => ({ ...s, jobId })) });
      // Published templates keep their snapshot; drafts must be republished to pick up new weights.
      await tx.interviewTemplate.updateMany({
        where: { jobId, status: "PUBLISHED" },
        data: { hasUnpublishedChanges: true },
      });
    }
    await audit(
      ctx,
      {
        action:
          input.status && input.status !== existing.status
            ? AUDIT_ACTIONS.jobStatusChanged
            : AUDIT_ACTIONS.jobUpdated,
        entityType: "job",
        entityId: jobId,
        metadata: {
          fields: Object.keys(rawInput),
          ...(input.status && input.status !== existing.status
            ? { from: existing.status, to: input.status }
            : {}),
        },
      },
      tx,
    );
    return job;
  });
}

export async function setJobStatus(ctx: ActorContext, jobId: string, status: JobStatus) {
  return updateJob(ctx, jobId, { status });
}

export async function deleteJob(ctx: ActorContext, jobId: string): Promise<void> {
  requirePermission(ctx, "job.write");
  await findJobOrThrow(ctx, jobId);
  await db.job.update({
    where: { id: jobId },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  });
  await audit(ctx, { action: AUDIT_ACTIONS.jobDeleted, entityType: "job", entityId: jobId });
}

export async function getJob(ctx: ActorContext, jobId: string) {
  requirePermission(ctx, "job.read");
  const job = await db.job.findFirst({
    where: { id: jobId, companyId: ctx.companyId, deletedAt: null },
    include: {
      skills: { include: { skill: true }, orderBy: { weight: "desc" } },
      templates: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          publishedVersion: true,
          hasUnpublishedChanges: true,
          durationMinutes: true,
          type: true,
          updatedAt: true,
        },
      },
      _count: { select: { applications: true } },
    },
  });
  if (!job) throw new AppError("NOT_FOUND", { message: "Job not found." });
  const stats = await jobStats(ctx.companyId, [jobId]);
  return { ...job, stats: stats.get(jobId) ?? emptyStats() };
}

interface JobStats {
  candidates: number;
  invited: number;
  completed: number;
  averageScore: number | null;
}

const emptyStats = (): JobStats => ({
  candidates: 0,
  invited: 0,
  completed: 0,
  averageScore: null,
});

async function jobStats(companyId: string, jobIds: string[]): Promise<Map<string, JobStats>> {
  const map = new Map<string, JobStats>(jobIds.map((id) => [id, emptyStats()]));
  if (jobIds.length === 0) return map;
  const rows = await db.$queryRaw<
    Array<{
      jobId: string;
      candidates: bigint;
      invited: bigint;
      completed: bigint;
      avgScore: number | null;
    }>
  >`
    SELECT a."jobId",
           COUNT(DISTINCT a."id") AS candidates,
           COUNT(DISTINCT i."id") AS invited,
           COUNT(DISTINCT s."id") FILTER (WHERE s."status" = 'COMPLETED') AS completed,
           AVG(COALESCE(e."overriddenScore", e."overallScore"))::float AS "avgScore"
    FROM "application" a
    JOIN "job" j ON j."id" = a."jobId"
    LEFT JOIN "interview_invitation" i ON i."applicationId" = a."id"
    LEFT JOIN "interview_session" s ON s."applicationId" = a."id"
    LEFT JOIN "interview_evaluation" e ON e."sessionId" = s."id" AND e."status" = 'COMPLETED'
    WHERE j."companyId" = ${companyId} AND a."jobId" IN (${Prisma.join(jobIds)})
    GROUP BY a."jobId"`;
  for (const row of rows) {
    map.set(row.jobId, {
      candidates: Number(row.candidates),
      invited: Number(row.invited),
      completed: Number(row.completed),
      averageScore: row.avgScore === null ? null : Math.round(row.avgScore),
    });
  }
  return map;
}

export async function listJobs(ctx: ActorContext, rawQuery: Partial<JobListQuery> = {}) {
  requirePermission(ctx, "job.read");
  const query = jobListQuerySchema.parse(rawQuery);
  const where: Prisma.JobWhereInput = {
    companyId: ctx.companyId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : { status: { not: "ARCHIVED" } }),
    ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    db.job.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        skills: { include: { skill: { select: { name: true } } }, orderBy: { weight: "desc" } },
        templates: { where: { deletedAt: null, status: "PUBLISHED" }, select: { id: true } },
      },
    }),
    db.job.count({ where }),
  ]);
  const stats = await jobStats(
    ctx.companyId,
    items.map((j) => j.id),
  );
  return {
    items: items.map((job) => ({ ...job, stats: stats.get(job.id) ?? emptyStats() })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listSkills(ctx: ActorContext) {
  requirePermission(ctx, "job.read");
  return db.skill.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } });
}

export type { JobSkillInput };
