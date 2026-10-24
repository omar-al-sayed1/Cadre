import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  LLMError,
  type LLMProvider,
  type LLMStructuredRequest,
  type LLMStructuredResponse,
  type LLMUsage,
  type LLMWebSearchRequest,
  type LLMWebSearchResponse,
} from "./types";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model: string;
  baseURL?: string;
  timeoutMs: number;
  maxRetries: number;
}

/**
 * Claude provider using the official Anthropic SDK.
 *
 * - Structured output via `messages.parse` + zod (`output_config.format`), so the
 *   response is schema-validated before it reaches application code.
 * - Stable system blocks carry `cache_control` so the per-version system prompt and
 *   per-session configuration are served from the prompt cache on every turn.
 * - `fallbacks: "default"` lets the API re-run a safety-classifier decline on
 *   Anthropic's recommended fallback model instead of failing the interview turn.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly defaultModel: string;
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.defaultModel = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: options.timeoutMs,
      maxRetries: options.maxRetries,
    });
  }

  async generateStructured<TSchema extends z.ZodType>(
    request: LLMStructuredRequest<TSchema>,
  ): Promise<LLMStructuredResponse<z.infer<TSchema>>> {
    const model = request.model ?? this.defaultModel;
    const started = Date.now();
    try {
      const response = await this.client.beta.messages.parse(
        {
          model,
          max_tokens: request.maxTokens ?? 16_000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: request.system.map((block) => ({
            type: "text" as const,
            text: block.text,
            ...(block.cacheable ? { cache_control: { type: "ephemeral" as const } } : {}),
          })),
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          output_config: {
            effort: request.effort ?? "medium",
            format: betaZodOutputFormat(request.schema),
          },
        },
        { timeout: request.timeoutMs ?? this.options.timeoutMs, signal: request.signal },
      );

      const usage = {
        inputTokens:
          response.usage.input_tokens +
          (response.usage.cache_read_input_tokens ?? 0) +
          (response.usage.cache_creation_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      };

      if (response.stop_reason === "refusal") {
        throw new LLMError("REFUSED", "The model declined this request", {
          usage,
          retryable: false,
        });
      }
      if (response.stop_reason === "max_tokens") {
        throw new LLMError("TRUNCATED", "The model response was truncated", { usage });
      }
      if (response.parsed_output === null || response.parsed_output === undefined) {
        throw new LLMError(
          "INVALID_OUTPUT",
          "The model response did not match the expected schema",
          { usage },
        );
      }

      return {
        data: response.parsed_output as z.infer<TSchema>,
        usage,
        model: response.model,
        provider: this.name,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      throw toLLMError(error);
    }
  }

  /**
   * Free-text research with Claude's server-side web search. Searches are called
   * directly (not from code execution) so every result arrives as a
   * `web_search_tool_result` block: those URLs are returned to the caller as the
   * only acceptable sources. A long server-side turn can stop with `pause_turn`;
   * it is resumed by re-sending the assistant content unchanged.
   */
  async searchWeb(request: LLMWebSearchRequest): Promise<LLMWebSearchResponse> {
    const model = request.model ?? this.defaultModel;
    const started = Date.now();
    const usage: LLMUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      webSearchRequests: 0,
    };
    const results = new Map<string, { url: string; title: string | null }>();
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: "user", content: request.prompt },
    ];
    let text = "";
    let servedModel = model;
    try {
      for (let round = 0; round < 4; round += 1) {
        const response = await this.client.beta.messages.create(
          {
            model,
            max_tokens: request.maxTokens ?? 16_000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: request.system.map((block) => ({
              type: "text" as const,
              text: block.text,
              ...(block.cacheable ? { cache_control: { type: "ephemeral" as const } } : {}),
            })),
            messages,
            tools: [
              {
                type: "web_search_20260209",
                name: "web_search",
                max_uses: request.maxSearches,
                allowed_callers: ["direct"],
                ...(request.blockedDomains?.length
                  ? { blocked_domains: request.blockedDomains.slice(0, 50) }
                  : {}),
              },
            ],
            output_config: { effort: request.effort ?? "medium" },
          },
          { timeout: request.timeoutMs ?? this.options.timeoutMs, signal: request.signal },
        );
        servedModel = response.model;
        usage.inputTokens +=
          response.usage.input_tokens +
          (response.usage.cache_read_input_tokens ?? 0) +
          (response.usage.cache_creation_input_tokens ?? 0);
        usage.outputTokens += response.usage.output_tokens;
        usage.cacheReadTokens! += response.usage.cache_read_input_tokens ?? 0;
        usage.cacheWriteTokens! += response.usage.cache_creation_input_tokens ?? 0;
        usage.webSearchRequests! += response.usage.server_tool_use?.web_search_requests ?? 0;

        for (const block of response.content) {
          if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content)
              results.set(r.url, { url: r.url, title: r.title ?? null });
          } else if (block.type === "text") {
            text += block.text;
          }
        }
        if (response.stop_reason === "refusal") {
          throw new LLMError("REFUSED", "The model declined this request", {
            usage,
            retryable: false,
          });
        }
        if (response.stop_reason !== "pause_turn") {
          if (response.stop_reason === "max_tokens" && !text.trim()) {
            throw new LLMError("TRUNCATED", "The model response was truncated", { usage });
          }
          break;
        }
        messages.push({ role: "assistant", content: response.content });
      }
      return {
        text: text.trim(),
        results: [...results.values()],
        usage,
        model: servedModel,
        provider: this.name,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const llmError = toLLMError(error);
      if (!llmError.options.usage) llmError.options.usage = usage;
      throw llmError;
    }
  }
}

function toLLMError(error: unknown): LLMError {
  if (error instanceof LLMError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    return new LLMError("RATE_LIMITED", "Rate limited by the model provider", { cause: error });
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new LLMError("AUTH", "The model provider rejected the credentials", {
      cause: error,
      retryable: false,
    });
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new LLMError(
      "BAD_REQUEST",
      `The model provider rejected the request: ${error.message}`,
      {
        cause: error,
        retryable: false,
      },
    );
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new LLMError("TIMEOUT", "The model provider timed out", { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LLMError("UNAVAILABLE", "Could not reach the model provider", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new LLMError("UNAVAILABLE", `Model provider error (${error.status ?? "unknown"})`, {
      cause: error,
    });
  }
  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) {
    return new LLMError("INVALID_OUTPUT", "The model response could not be parsed", {
      cause: error,
    });
  }
  return new LLMError(
    "UNAVAILABLE",
    error instanceof Error ? error.message : "Unknown model error",
    { cause: error },
  );
}
