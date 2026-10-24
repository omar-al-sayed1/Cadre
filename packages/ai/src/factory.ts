import { AnthropicProvider } from "./llm/anthropic";
import { OpenAICompatibleProvider } from "./llm/openai-compatible";
import type { LLMProvider } from "./llm/types";
import { DemoInterviewAI } from "./demo/demo-interview-ai";
import { LlmInterviewAI } from "./service/llm-interview-ai";
import type { InterviewAI } from "./service/types";
import type { AiTelemetrySink } from "./telemetry";
import { DemoSalesAI } from "./sales/demo-sales-ai";
import { LlmSalesAI } from "./sales/llm-sales-ai";
import type { SalesAI } from "./sales/types";

export interface AiFactoryConfig {
  demoMode: boolean;
  provider: "anthropic" | "openai" | "ollama" | "mock";
  model?: string;
  fastModel?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
  maxRetries: number;
}

export const DEFAULT_MODELS: Record<"anthropic" | "openai" | "ollama", string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
  ollama: "qwen2.5:7b-instruct",
};

/** Ollama's OpenAI-compatible endpoint on this machine (a free, local model — no API key). */
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

export function createLlmProvider(config: AiFactoryConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider({
        apiKey: config.apiKey,
        model: config.model ?? DEFAULT_MODELS.anthropic,
        baseURL: config.baseUrl,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
      });
    case "openai":
      return new OpenAICompatibleProvider({
        apiKey: config.apiKey,
        model: config.model ?? DEFAULT_MODELS.openai,
        baseURL: config.baseUrl,
        timeoutMs: config.timeoutMs,
      });
    case "ollama":
      return new OpenAICompatibleProvider({
        apiKey: config.apiKey,
        model: config.model ?? DEFAULT_MODELS.ollama,
        baseURL: config.baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
        // Local models on a laptop CPU are slow; give them room.
        timeoutMs: Math.max(config.timeoutMs, 180_000),
        name: "ollama",
      });
    case "mock":
      throw new Error("The mock provider is served by DemoInterviewAI; use createInterviewAI()");
  }
}

/** Build the application-facing AI service from configuration. */
export function createInterviewAI(
  config: AiFactoryConfig,
  telemetry?: AiTelemetrySink,
): InterviewAI {
  if (config.demoMode || config.provider === "mock") {
    return new DemoInterviewAI();
  }
  return new LlmInterviewAI({
    provider: createLlmProvider(config),
    turnModel: config.fastModel,
    telemetry,
    maxAttempts: 2,
  });
}

/** The AI Sales Agent's model-facing service (same provider configuration). */
export function createSalesAI(config: AiFactoryConfig, telemetry?: AiTelemetrySink): SalesAI {
  if (config.demoMode || config.provider === "mock") {
    return new DemoSalesAI();
  }
  return new LlmSalesAI({
    provider: createLlmProvider(config),
    fastModel: config.fastModel,
    telemetry,
    maxAttempts: 2,
  });
}
