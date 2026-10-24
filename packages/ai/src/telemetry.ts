import type { AiOperation, LLMUsage } from "./llm/types";

/**
 * AI telemetry: one event per model call (success or failure). Prompts and
 * outputs are never part of telemetry — only sizes, timings and costs.
 */
export interface AiTelemetryEvent {
  operation: AiOperation;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
  success: boolean;
  errorCode?: string;
  companyId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  agentType?: "INTERVIEWER" | "SALES" | null;
}

export interface AiTelemetrySink {
  record(event: AiTelemetryEvent): void | Promise<void>;
}

export const noopTelemetry: AiTelemetrySink = { record: () => {} };

/** USD per 1M tokens. Unknown models cost-estimate as 0 and are flagged in analytics. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

/** Server-side web search: $10 per 1,000 searches. */
const WEB_SEARCH_USD_PER_REQUEST = 0.01;

function priceFor(model: string): { input: number; output: number } | undefined {
  if (PRICING[model]) return PRICING[model];
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  return key ? PRICING[key] : undefined;
}

export function estimateLlmCostUsd(model: string, usage: LLMUsage): number {
  const price = priceFor(model);
  if (!price) return 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const uncached = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
  const inputCost = (uncached + cacheRead * 0.1 + cacheWrite * 1.25) * price.input;
  const outputCost = usage.outputTokens * price.output;
  const searchCost = (usage.webSearchRequests ?? 0) * WEB_SEARCH_USD_PER_REQUEST;
  return Number(((inputCost + outputCost) / 1_000_000 + searchCost).toFixed(6));
}
