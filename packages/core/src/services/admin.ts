import { FEATURE_FLAGS, FEATURE_FLAG_KEYS, isFeatureFlagKey, PLANS } from "@repo/config";
import { getServerEnv } from "@repo/config/env";
import { db } from "@repo/database";
import { jobQueue } from "@repo/queue";
import { AppError, startOfMonthUtc, type PlatformRole } from "@repo/shared";
import {
  assignPlanSchema,
  featureFlagOverrideSchema,
  featureFlagUpdateSchema,
} from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requireSuperAdmin } from "../context";
import { getCompanyUsage } from "../usage";

/**
 * SUPER_ADMIN platform operations (spec §77). Admins see aggregate data;
 * opening a company's interviews is not exposed here and requires membership.
 */
interface AdminActor {
  userId: string;
  platformRole: PlatformRole;
}

const asAuditActor = (actor: AdminActor) => ({
  userId: actor.userId,
  userName: "admin",
  companyId: "",
  role: "COMPANY_ADMIN" as const,
  platformRole: actor.platformRole,
});

export async function adminOverview(actor: AdminActor) {
  requireSuperAdmin(actor);
  const since = startOfMonthUtc();
  const [companies, users, sessionsMonth, aiCost, failedJobs, queue, aiErrors, aiCalls] =
    await Promise.all([
      db.company.count({ where: { deletedAt: null } }),
      db.user.count({ where: { deletedAt: null } }),
      db.interviewSession.count({ where: { createdAt: { gte: since } } }),
      db.aiUsageEvent.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      }),
      db.backgroundJob.count({ where: { status: "FAILED" } }),
      jobQueue.stats(),
      db.aiUsageEvent.count({
        where: { createdAt: { gte: new Date(Date.now() - 86_400_000) }, success: false },
      }),
      db.aiUsageEvent.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    ]);
  const env = getServerEnv();
  let database = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }
  const latency = await db.aiUsageEvent.aggregate({
    where: { createdAt: { gte: new Date(Date.now() - 86_400_000) }, success: true },
    _avg: { latencyMs: true },
  });
  return {
    totals: {
      companies,
      users,
      sessionsThisMonth: sessionsMonth,
      aiCostThisMonthUsd: Number((aiCost._sum.estimatedCostUsd ?? 0).toFixed(2)),
      inputTokens: aiCost._sum.inputTokens ?? 0,
      outputTokens: aiCost._sum.outputTokens ?? 0,
    },
    health: {
      database,
      queue,
      failedJobs,
      aiErrorRate24h: aiCalls > 0 ? Math.round((aiErrors / aiCalls) * 1000) / 10 : 0,
      aiAvgLatencyMs24h: Math.round(latency._avg.latencyMs ?? 0),
      demoMode: env.DEMO_MODE,
      aiProvider: env.DEMO_MODE ? "demo" : env.AI_PROVIDER,
      sttProvider: env.STT_PROVIDER,
      ttsProvider: env.TTS_PROVIDER,
      storageProvider: env.STORAGE_PROVIDER,
      emailProvider: env.EMAIL_PROVIDER,
    },
  };
}

export async function adminListCompanies(actor: AdminActor) {
  requireSuperAdmin(actor);
  const companies = await db.company.findMany({
    where: { deletedAt: null },
    include: {
      plan: true,
      subscriptions: { include: { plan: true } },
      _count: { select: { members: true, jobs: true, candidates: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return Promise.all(companies.map(async (c) => ({ ...c, usage: await getCompanyUsage(c.id) })));
}

export async function adminListUsers(actor: AdminActor) {
  requireSuperAdmin(actor);
  return db.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      platformRole: true,
      createdAt: true,
      lastLoginAt: true,
      memberships: { select: { role: true, company: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function adminUsageByCompany(actor: AdminActor) {
  requireSuperAdmin(actor);
  const since = startOfMonthUtc();
  const rows = await db.aiUsageEvent.groupBy({
    by: ["companyId", "operation"],
    where: { createdAt: { gte: since } },
    _sum: {
      estimatedCostUsd: true,
      inputTokens: true,
      outputTokens: true,
      audioSeconds: true,
      characters: true,
    },
    _count: { _all: true },
  });
  const companies = await db.company.findMany({
    where: { id: { in: rows.map((r) => r.companyId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, name: true },
  });
  const names = new Map(companies.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    companyId: r.companyId,
    company: r.companyId ? (names.get(r.companyId) ?? "Unknown") : "Platform",
    operation: r.operation,
    calls: r._count._all,
    costUsd: Number((r._sum.estimatedCostUsd ?? 0).toFixed(4)),
    inputTokens: r._sum.inputTokens ?? 0,
    outputTokens: r._sum.outputTokens ?? 0,
    audioSeconds: Math.round(r._sum.audioSeconds ?? 0),
    characters: r._sum.characters ?? 0,
  }));
}

export async function adminListFeatureFlags(actor: AdminActor) {
  requireSuperAdmin(actor);
  const rows = await db.featureFlag.findMany({
    include: { overrides: { include: { company: { select: { name: true } } } } },
  });
  return FEATURE_FLAG_KEYS.map((key) => {
    const row = rows.find((r) => r.key === key);
    return {
      key,
      description: FEATURE_FLAGS[key].description,
      enabled: row ? row.enabled : FEATURE_FLAGS[key].default,
      rolloutPercentage: row?.rolloutPercentage ?? 100,
      persisted: Boolean(row),
      overrides:
        row?.overrides.map((o) => ({
          companyId: o.companyId,
          company: o.company.name,
          enabled: o.enabled,
        })) ?? [],
    };
  });
}

export async function adminUpdateFeatureFlag(actor: AdminActor, key: string, rawInput: unknown) {
  requireSuperAdmin(actor);
  if (!isFeatureFlagKey(key)) throw new AppError("NOT_FOUND", { message: "Unknown feature flag." });
  const input = featureFlagUpdateSchema.parse(rawInput);
  const flag = await db.featureFlag.upsert({
    where: { key },
    update: input,
    create: {
      key,
      description: FEATURE_FLAGS[key].description,
      enabled: input.enabled ?? FEATURE_FLAGS[key].default,
      rolloutPercentage: input.rolloutPercentage ?? 100,
    },
  });
  await audit(asAuditActor(actor), {
    action: AUDIT_ACTIONS.featureFlagChanged,
    entityType: "feature_flag",
    entityId: key,
    metadata: input,
  });
  return flag;
}

export async function adminSetFeatureFlagOverride(
  actor: AdminActor,
  key: string,
  rawInput: unknown,
) {
  requireSuperAdmin(actor);
  if (!isFeatureFlagKey(key)) throw new AppError("NOT_FOUND", { message: "Unknown feature flag." });
  const input = featureFlagOverrideSchema.parse(rawInput);
  const flag = await db.featureFlag.upsert({
    where: { key },
    update: {},
    create: {
      key,
      description: FEATURE_FLAGS[key].description,
      enabled: FEATURE_FLAGS[key].default,
    },
  });
  if (input.enabled === null) {
    await db.featureFlagOverride.deleteMany({
      where: { flagId: flag.id, companyId: input.companyId },
    });
  } else {
    await db.featureFlagOverride.upsert({
      where: { flagId_companyId: { flagId: flag.id, companyId: input.companyId } },
      update: { enabled: input.enabled },
      create: { flagId: flag.id, companyId: input.companyId, enabled: input.enabled },
    });
  }
  await audit(asAuditActor(actor), {
    action: AUDIT_ACTIONS.featureFlagChanged,
    entityType: "feature_flag",
    entityId: key,
    metadata: input,
  });
}

export async function adminAssignPlan(actor: AdminActor, companyId: string, rawInput: unknown) {
  requireSuperAdmin(actor);
  const { planKey } = assignPlanSchema.parse(rawInput);
  const def = PLANS[planKey as keyof typeof PLANS];
  if (!def) throw new AppError("VALIDATION_FAILED", { message: "Unknown plan." });
  const plan = await db.plan.upsert({
    where: { key: def.key },
    update: {},
    create: {
      key: def.key,
      name: def.name,
      monthlyInterviewLimit: def.monthlyInterviewLimit,
      monthlyAiBudgetUsd: def.monthlyAiBudgetUsd,
      seats: def.seats,
      priceMonthlyCents: def.priceMonthlyCents,
    },
  });
  await db.company.update({ where: { id: companyId }, data: { planId: plan.id } });
  await audit(
    { ...asAuditActor(actor), companyId },
    {
      action: AUDIT_ACTIONS.planChanged,
      entityType: "company",
      entityId: companyId,
      metadata: { planKey },
    },
  );
}

export async function adminListJobs(
  actor: AdminActor,
  status: "FAILED" | "PENDING" | "RUNNING" = "FAILED",
) {
  requireSuperAdmin(actor);
  return db.backgroundJob.findMany({
    where: { status },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      lastError: true,
      runAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });
}

export async function adminRetryJob(actor: AdminActor, jobId: string): Promise<void> {
  requireSuperAdmin(actor);
  await jobQueue.retry(jobId);
  await audit(asAuditActor(actor), {
    action: AUDIT_ACTIONS.jobRetried,
    entityType: "background_job",
    entityId: jobId,
  });
}
