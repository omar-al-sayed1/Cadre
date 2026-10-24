import { DEFAULT_PLAN_KEY, PLANS } from "@repo/config";
import { db } from "@repo/database";
import { AppError, startOfMonthUtc } from "@repo/shared";
import type { AiTelemetryEvent, AiTelemetrySink } from "@repo/ai";
import { getProductAccess } from "./services/subscriptions";

/**
 * Usage & cost tracking (spec §65, §89). Every model / speech call becomes an
 * AiUsageEvent row; monthly aggregates power plan limits and the admin panel.
 */
export const usageTelemetrySink: AiTelemetrySink = {
  async record(event: AiTelemetryEvent) {
    await db.aiUsageEvent.create({
      data: {
        companyId: event.companyId ?? null,
        sessionId: event.sessionId ?? null,
        operation: event.operation,
        provider: event.provider,
        model: event.model,
        promptVersion: event.promptVersion,
        latencyMs: event.latencyMs,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        estimatedCostUsd: event.estimatedCostUsd,
        success: event.success,
        errorCode: event.errorCode ?? null,
        agentType: event.agentType ?? null,
        userId: event.userId ?? null,
      },
    });
  },
};

/** Approximate list prices for speech (USD). Adjust to your contracts. */
const SPEECH_PRICING = {
  sttPerMinute: { openai: 0.006, deepgram: 0.0043, mock: 0, browser: 0 } as Record<string, number>,
  ttsPerMillionChars: { openai: 15, elevenlabs: 165, mock: 0, browser: 0 } as Record<
    string,
    number
  >,
};

export async function recordSpeechUsage(input: {
  kind: "SPEECH_TO_TEXT" | "TEXT_TO_SPEECH";
  provider: string;
  model: string;
  companyId: string;
  sessionId: string;
  latencyMs: number;
  audioSeconds?: number;
  characters?: number;
  success: boolean;
  errorCode?: string;
}): Promise<void> {
  const cost =
    input.kind === "SPEECH_TO_TEXT"
      ? ((input.audioSeconds ?? 0) / 60) * (SPEECH_PRICING.sttPerMinute[input.provider] ?? 0)
      : ((input.characters ?? 0) / 1_000_000) *
        (SPEECH_PRICING.ttsPerMillionChars[input.provider] ?? 0);
  await db.aiUsageEvent.create({
    data: {
      companyId: input.companyId,
      sessionId: input.sessionId,
      operation: input.kind,
      provider: input.provider,
      model: input.model,
      latencyMs: input.latencyMs,
      audioSeconds: input.audioSeconds ?? null,
      characters: input.characters ?? null,
      estimatedCostUsd: Number(cost.toFixed(6)),
      success: input.success,
      errorCode: input.errorCode ?? null,
    },
  });
}

export interface CompanyUsage {
  interviewsThisMonth: number;
  interviewLimit: number | null;
  aiCostThisMonthUsd: number;
  aiBudgetUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  sttSeconds: number;
  ttsCharacters: number;
  planKey: string;
  planName: string;
}

export async function getCompanyUsage(companyId: string): Promise<CompanyUsage> {
  const since = startOfMonthUtc();
  const [company, subscription, interviews, agg] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, include: { plan: true } }),
    db.productSubscription.findUnique({
      where: { companyId_productKey: { companyId, productKey: "interviewer" } },
      include: { plan: true },
    }),
    db.interviewSession.count({ where: { companyId, createdAt: { gte: since } } }),
    db.aiUsageEvent.aggregate({
      where: { companyId, createdAt: { gte: since } },
      _sum: {
        estimatedCostUsd: true,
        inputTokens: true,
        outputTokens: true,
        audioSeconds: true,
        characters: true,
      },
    }),
  ]);
  const fallback = PLANS[DEFAULT_PLAN_KEY as keyof typeof PLANS];
  // The interviewer's product subscription is authoritative; company.plan is the legacy fallback.
  const plan = subscription?.plan ?? company?.plan;
  return {
    interviewsThisMonth: interviews,
    interviewLimit: plan ? plan.monthlyInterviewLimit : fallback.monthlyInterviewLimit,
    aiCostThisMonthUsd: Number((agg._sum.estimatedCostUsd ?? 0).toFixed(4)),
    aiBudgetUsd: plan ? plan.monthlyAiBudgetUsd : fallback.monthlyAiBudgetUsd,
    inputTokens: agg._sum.inputTokens ?? 0,
    outputTokens: agg._sum.outputTokens ?? 0,
    sttSeconds: Math.round(agg._sum.audioSeconds ?? 0),
    ttsCharacters: agg._sum.characters ?? 0,
    planKey: plan?.key ?? fallback.key,
    planName: plan?.name ?? fallback.name,
  };
}

/** Enforce the plan's monthly interview limit before a new session starts. */
export async function assertInterviewQuota(companyId: string): Promise<void> {
  const access = await getProductAccess(companyId, "interviewer");
  if (!access.active) {
    throw new AppError("PRODUCT_NOT_ENABLED", {
      message:
        "This company isn't accepting new interviews right now. Please contact the recruiter.",
    });
  }
  const usage = await getCompanyUsage(companyId);
  if (usage.interviewLimit !== null && usage.interviewsThisMonth >= usage.interviewLimit) {
    throw new AppError("PLAN_LIMIT_REACHED", {
      message:
        "This company has reached its monthly interview limit. Please contact the recruiter.",
    });
  }
  if (usage.aiBudgetUsd !== null && usage.aiCostThisMonthUsd >= usage.aiBudgetUsd) {
    throw new AppError("PLAN_LIMIT_REACHED", {
      message: "This company has reached its monthly AI usage budget.",
    });
  }
}
