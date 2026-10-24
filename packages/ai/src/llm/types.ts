import type { z } from "zod";

/**
 * Low-level, vendor-neutral LLM interface. Model vendors implement this and
 * nothing else; all interview logic lives above it in the InterviewAI layer.
 */

export type AiOperation =
  | "GENERATE_INTERVIEW"
  | "NEXT_ACTION"
  | "EVALUATE_ANSWER"
  | "EVALUATE_INTERVIEW"
  | "PARSE_RESUME"
  | "SUMMARIZE_MEMORY"
  | "SALES_COPILOT"
  | "SALES_RESEARCH"
  | "SALES_QUALIFY"
  | "SALES_GENERATE_MESSAGE"
  | "SALES_ANALYZE_CONVERSATION"
  | "SALES_DISCOVER";

export type Effort = "low" | "medium" | "high";

/** A system block. `cacheable` marks a stable prefix (prompt caching where supported). */
export interface SystemBlock {
  text: string;
  cacheable?: boolean;
}

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMStructuredRequest<TSchema extends z.ZodType> {
  operation: AiOperation;
  system: SystemBlock[];
  messages: LLMMessage[];
  schema: TSchema;
  /** Short identifier used for schema naming / logging. */
  schemaName: string;
  model?: string;
  maxTokens?: number;
  effort?: Effort;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Server-side web searches billed on this call. */
  webSearchRequests?: number;
}

/** A free-text answer researched with the provider's own web search tool. */
export interface LLMWebSearchRequest {
  operation: AiOperation;
  system: SystemBlock[];
  prompt: string;
  /** Upper bound on searches for the whole request. */
  maxSearches: number;
  /** Domains the search must never return (e.g. the company's own site). */
  blockedDomains?: string[];
  model?: string;
  maxTokens?: number;
  effort?: Effort;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface LLMWebSearchResponse {
  text: string;
  /** Every result the search tool actually returned — the only URLs a caller may treat as sources. */
  results: Array<{ url: string; title: string | null }>;
  usage: LLMUsage;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface LLMStructuredResponse<T> {
  data: T;
  usage: LLMUsage;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  generateStructured<TSchema extends z.ZodType>(
    request: LLMStructuredRequest<TSchema>,
  ): Promise<LLMStructuredResponse<z.infer<TSchema>>>;
  /** Present only on providers with a built-in, permitted web search tool. */
  searchWeb?(request: LLMWebSearchRequest): Promise<LLMWebSearchResponse>;
}

/** Error classification used for retry / fallback decisions. */
export type LLMErrorKind =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "REFUSED"
  | "TRUNCATED"
  | "BAD_REQUEST"
  | "AUTH";

export class LLMError extends Error {
  constructor(
    readonly kind: LLMErrorKind,
    message: string,
    readonly options: { cause?: unknown; usage?: LLMUsage; retryable?: boolean } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "LLMError";
  }

  get retryable(): boolean {
    if (this.options.retryable !== undefined) return this.options.retryable;
    return ["RATE_LIMITED", "TIMEOUT", "UNAVAILABLE", "INVALID_OUTPUT", "TRUNCATED"].includes(
      this.kind,
    );
  }
}
