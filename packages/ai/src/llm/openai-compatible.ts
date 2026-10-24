import { z } from "zod";
import { extractJsonObject } from "./json";
import {
  LLMError,
  type LLMProvider,
  type LLMStructuredRequest,
  type LLMStructuredResponse,
} from "./types";

export interface OpenAICompatibleProviderOptions {
  apiKey?: string;
  model: string;
  baseURL?: string;
  timeoutMs: number;
  /** Reported in telemetry ("openai", "ollama", …). */
  name?: string;
}

/**
 * Provider for any OpenAI-compatible Chat Completions endpoint (OpenAI, Azure
 * OpenAI, OpenRouter, vLLM, a local Ollama model, …). Uses JSON mode plus client-side zod validation,
 * which is the lowest common denominator these gateways support.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  private readonly baseURL: string;

  constructor(private readonly options: OpenAICompatibleProviderOptions) {
    this.name = options.name ?? "openai";
    this.defaultModel = options.model;
    this.baseURL = (options.baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async generateStructured<TSchema extends z.ZodType>(
    request: LLMStructuredRequest<TSchema>,
  ): Promise<LLMStructuredResponse<z.infer<TSchema>>> {
    const model = request.model ?? this.defaultModel;
    const started = Date.now();
    const jsonSchema = JSON.stringify(
      z.toJSONSchema(request.schema, { io: "output", unrepresentable: "any" }),
    );
    const system = [
      ...request.system.map((b) => b.text),
      `Respond with a single JSON object that conforms to this JSON Schema (named "${request.schemaName}"). Output JSON only.\n${jsonSchema}`,
    ].join("\n\n");

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      request.timeoutMs ?? this.options.timeoutMs,
    );
    request.signal?.addEventListener("abort", () => controller.abort(), { once: true });

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          max_completion_tokens: request.maxTokens ?? 8_000,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, ...request.messages],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new LLMError(
        aborted ? "TIMEOUT" : "UNAVAILABLE",
        aborted ? "Model request timed out" : "Could not reach the model provider",
        { cause: error },
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const kind =
        response.status === 429
          ? "RATE_LIMITED"
          : response.status === 401 || response.status === 403
            ? "AUTH"
            : response.status >= 500
              ? "UNAVAILABLE"
              : "BAD_REQUEST";
      throw new LLMError(kind, `Model provider returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      model?: string;
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string | null; refusal?: string | null };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    const usage = {
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
      cacheReadTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };
    const choice = body.choices?.[0];
    if (choice?.message?.refusal) {
      throw new LLMError("REFUSED", "The model declined this request", { usage, retryable: false });
    }
    if (choice?.finish_reason === "length") {
      throw new LLMError("TRUNCATED", "The model response was truncated", { usage });
    }
    const raw = extractJsonObject(choice?.message?.content ?? "");
    const parsed = request.schema.safeParse(raw);
    if (!parsed.success) {
      throw new LLMError("INVALID_OUTPUT", "The model response did not match the expected schema", {
        usage,
        cause: parsed.error,
      });
    }
    return {
      data: parsed.data as z.infer<TSchema>,
      usage,
      model: body.model ?? model,
      provider: this.name,
      latencyMs: Date.now() - started,
    };
  }
}
