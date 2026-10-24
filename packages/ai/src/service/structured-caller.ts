import type { z } from "zod";
import { logger } from "@repo/shared";
import {
  LLMError,
  type AiOperation,
  type Effort,
  type LLMProvider,
  type LLMUsage,
  type LLMWebSearchRequest,
  type LLMWebSearchResponse,
  type SystemBlock,
} from "../llm/types";
import { estimateLlmCostUsd, noopTelemetry, type AiTelemetrySink } from "../telemetry";
import type { AiCallMeta, AiResult } from "./types";

/**
 * Shared plumbing for every AI employee: one structured (schema-validated) LLM
 * call with retries on retryable failures, a corrective retry when output
 * doesn't match the schema, and one telemetry event per attempt for cost
 * tracking. The model never touches application state — callers receive
 * validated JSON and apply business rules themselves.
 */
export interface CallSpec<TSchema extends z.ZodType> {
  operation: AiOperation;
  promptVersion: string;
  system: SystemBlock[];
  user: string;
  schema: TSchema;
  schemaName: string;
  effort: Effort;
  maxTokens: number;
  model?: string;
  timeoutMs?: number;
}

export interface StructuredCallerOptions {
  provider: LLMProvider;
  telemetry?: AiTelemetrySink;
  /** Total attempts including the first (min 1). */
  maxAttempts?: number;
}

export class StructuredCaller {
  readonly providerName: string;
  private readonly telemetry: AiTelemetrySink;
  private readonly maxAttempts: number;

  constructor(private readonly options: StructuredCallerOptions) {
    this.providerName = options.provider.name;
    this.telemetry = options.telemetry ?? noopTelemetry;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  }

  get defaultModel(): string {
    return this.options.provider.defaultModel;
  }

  async call<TSchema extends z.ZodType>(
    spec: CallSpec<TSchema>,
    meta: AiCallMeta = {},
  ): Promise<AiResult<z.infer<TSchema>>> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      const started = Date.now();
      const model = spec.model ?? this.options.provider.defaultModel;
      const user =
        attempt === 0
          ? spec.user
          : `${spec.user}\n\nYour previous response could not be used because it did not match the required JSON schema. Return a single valid JSON object that matches the schema exactly.`;
      try {
        const result = await this.options.provider.generateStructured({
          operation: spec.operation,
          system: spec.system,
          messages: [{ role: "user", content: user }],
          schema: spec.schema,
          schemaName: spec.schemaName,
          effort: spec.effort,
          maxTokens: spec.maxTokens,
          model,
          timeoutMs: spec.timeoutMs,
          signal: meta.signal,
        });
        await this.record(
          spec,
          result.model,
          result.usage,
          Date.now() - started,
          true,
          undefined,
          meta,
        );
        return {
          data: result.data,
          promptVersion: spec.promptVersion,
          provider: result.provider,
          model: result.model,
        };
      } catch (error) {
        lastError = error;
        const llmError =
          error instanceof LLMError
            ? error
            : new LLMError("UNAVAILABLE", String(error), { cause: error });
        await this.record(
          spec,
          model,
          llmError.options.usage ?? { inputTokens: 0, outputTokens: 0 },
          Date.now() - started,
          false,
          llmError.kind,
          meta,
        );
        logger.warn("ai.call_failed", {
          operation: spec.operation,
          attempt,
          kind: llmError.kind,
          provider: this.providerName,
        });
        if (!llmError.retryable || meta.signal?.aborted) break;
      }
    }
    throw lastError instanceof LLMError
      ? lastError
      : new LLMError("UNAVAILABLE", "AI call failed", { cause: lastError });
  }

  /** True when the provider has a permitted web search tool. */
  get canSearchWeb(): boolean {
    return typeof this.options.provider.searchWeb === "function";
  }

  /** One web-search-backed free-text call, with the same retry and telemetry rules. */
  async searchWeb(
    spec: Omit<LLMWebSearchRequest, "signal"> & { promptVersion: string },
    meta: AiCallMeta = {},
  ): Promise<LLMWebSearchResponse> {
    const searchWeb = this.options.provider.searchWeb?.bind(this.options.provider);
    if (!searchWeb) {
      throw new LLMError("BAD_REQUEST", "This AI provider has no web search tool", {
        retryable: false,
      });
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      const started = Date.now();
      const model = spec.model ?? this.options.provider.defaultModel;
      try {
        const result = await searchWeb({ ...spec, model, signal: meta.signal });
        await this.record(
          spec,
          result.model,
          result.usage,
          Date.now() - started,
          true,
          undefined,
          meta,
        );
        return result;
      } catch (error) {
        lastError = error;
        const llmError =
          error instanceof LLMError
            ? error
            : new LLMError("UNAVAILABLE", String(error), { cause: error });
        await this.record(
          spec,
          model,
          llmError.options.usage ?? { inputTokens: 0, outputTokens: 0 },
          Date.now() - started,
          false,
          llmError.kind,
          meta,
        );
        logger.warn("ai.call_failed", {
          operation: spec.operation,
          attempt,
          kind: llmError.kind,
          provider: this.providerName,
        });
        if (!llmError.retryable || meta.signal?.aborted) break;
      }
    }
    throw lastError instanceof LLMError
      ? lastError
      : new LLMError("UNAVAILABLE", "AI call failed", { cause: lastError });
  }

  private async record(
    spec: { operation: AiOperation; promptVersion: string },
    model: string,
    usage: LLMUsage,
    latencyMs: number,
    success: boolean,
    errorCode: string | undefined,
    meta: AiCallMeta,
  ): Promise<void> {
    try {
      await this.telemetry.record({
        operation: spec.operation,
        provider: this.providerName,
        model,
        promptVersion: spec.promptVersion,
        latencyMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        estimatedCostUsd: estimateLlmCostUsd(model, usage),
        success,
        errorCode,
        companyId: meta.companyId ?? null,
        sessionId: meta.sessionId ?? null,
        userId: meta.userId ?? null,
        agentType: meta.agentType ?? null,
      });
    } catch (error) {
      logger.warn("ai.telemetry_failed", { error });
    }
  }
}
