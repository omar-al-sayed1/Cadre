import {
  createInterviewAI,
  createSalesAI,
  type AiFactoryConfig,
  type InterviewAI,
  type SalesAI,
} from "@repo/ai";
import { getServerEnv } from "@repo/config/env";
import { InterviewEngine } from "@repo/interview-engine";
import { usageTelemetrySink } from "./usage";

/**
 * Process-wide service wiring. Providers are chosen from configuration once and
 * can be replaced in tests.
 */
let ai: InterviewAI | undefined;
let engine: InterviewEngine | undefined;
let salesAi: SalesAI | undefined;

function aiConfig(): AiFactoryConfig {
  const env = getServerEnv();
  return {
    demoMode: env.DEMO_MODE,
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    fastModel: env.AI_FAST_MODEL,
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxRetries: env.AI_MAX_RETRIES,
  };
}

export function getInterviewAI(): InterviewAI {
  ai ??= createInterviewAI(aiConfig(), usageTelemetrySink);
  return ai;
}

export function getEngine(): InterviewEngine {
  engine ??= new InterviewEngine(getInterviewAI());
  return engine;
}

export function setInterviewAIForTesting(instance: InterviewAI | undefined): void {
  ai = instance;
  engine = undefined;
}

export function appUrl(path = ""): string {
  const base = getServerEnv().APP_URL.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The Sales Agent's model: the shared AI configuration, unless SALES_AI_PROVIDER
 * gives it its own (e.g. a free local Ollama model for prospecting while
 * interviews keep their engine). The override applies even in demo mode.
 */
function salesAiConfig(): AiFactoryConfig {
  const env = getServerEnv();
  if (!env.SALES_AI_PROVIDER) return aiConfig();
  return {
    demoMode: false,
    provider: env.SALES_AI_PROVIDER,
    model: env.SALES_AI_MODEL,
    fastModel: env.SALES_AI_MODEL,
    apiKey:
      env.SALES_AI_API_KEY ?? (env.SALES_AI_PROVIDER === "ollama" ? undefined : env.AI_API_KEY),
    baseUrl: env.SALES_AI_BASE_URL,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxRetries: env.AI_MAX_RETRIES,
  };
}

/** The AI Sales Agent's model service. */
export function getSalesAI(): SalesAI {
  salesAi ??= createSalesAI(salesAiConfig(), usageTelemetrySink);
  return salesAi;
}

export function setSalesAIForTesting(instance: SalesAI | undefined): void {
  salesAi = instance;
}
