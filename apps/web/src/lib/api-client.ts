"use client";

/** Typed fetch wrapper for client components. Errors carry the API's code, message and field errors. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly retryAfter?: number,
    /** Extra fields the API exposed with the error (e.g. duplicateOf). */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Abort after this many ms (default 60s). */
  timeoutMs?: number;
}

export async function api<T = unknown>(url: string, options: ApiOptions = {}): Promise<T> {
  const { body, timeoutMs = 60_000, headers, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (rest.signal) rest.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: controller.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted = error instanceof DOMException && error.name === "AbortError";
    throw new ApiError(
      aborted
        ? "The request took too long. Please try again."
        : "Network error — check your connection and try again.",
      0,
      aborted ? "TIMEOUT" : "NETWORK",
    );
  }
  clearTimeout(timer);
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as {
    error?: {
      code?: string;
      message?: string;
      fieldErrors?: Record<string, string[]>;
      retryAfter?: number;
    } & Record<string, unknown>;
  };
  if (!response.ok) {
    throw new ApiError(
      data.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      data.error?.code ?? "INTERNAL",
      data.error?.fieldErrors ?? {},
      data.error?.retryAfter,
      data.error ?? {},
    );
  }
  return data as T;
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
