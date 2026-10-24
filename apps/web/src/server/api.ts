import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@repo/config/env";
import { isNotFoundError } from "@repo/database";
import { AppError, isAppError, logger } from "@repo/shared";
import { formatZodError } from "@repo/validation";

export interface RouteContext<P> {
  params: P;
  requestId: string;
}

type Handler<P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<unknown>;

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedOrigins(): Set<string> {
  const env = getServerEnv();
  const origins = new Set<string>([new URL(env.APP_URL).origin]);
  for (const origin of env.AUTH_TRUSTED_ORIGINS?.split(",") ?? []) {
    try {
      if (origin.trim()) origins.add(new URL(origin.trim()).origin);
    } catch {
      // ignore malformed entries
    }
  }
  return origins;
}

/**
 * CSRF defence for cookie-authenticated mutations: browsers always send Origin
 * (or Sec-Fetch-Site) on cross-site POSTs, so we require it to be ours.
 */
function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  if (origin) {
    if (!allowedOrigins().has(origin) && origin !== req.nextUrl.origin) {
      throw new AppError("FORBIDDEN", { message: "Cross-site request blocked." });
    }
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new AppError("FORBIDDEN", { message: "Cross-site request blocked." });
  }
}

export function errorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Some of the submitted information is invalid.",
          fieldErrors: formatZodError(error),
        },
      },
      { status: 422, headers: { "x-request-id": requestId } },
    );
  }
  if (isAppError(error)) {
    if (error.status >= 500)
      logger.error("api.error", { requestId, code: error.code, error: error.cause ?? error });
    const headers: Record<string, string> = { "x-request-id": requestId };
    const retryAfter = error.expose?.retryAfter;
    if (typeof retryAfter === "number") headers["retry-after"] = String(retryAfter);
    return NextResponse.json(error.toJSON(), { status: error.status, headers });
  }
  if (isNotFoundError(error)) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "We couldn't find what you were looking for." } },
      { status: 404, headers: { "x-request-id": requestId } },
    );
  }
  logger.error("api.unhandled_error", { requestId, error });
  // Never leak stack traces or internals to clients.
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL",
        message: "Something went wrong on our side. Please try again.",
        requestId,
      },
    },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}

/** Wrap a route handler with request ids, CSRF checks, logging and error mapping. */
export function route<P = Record<string, string>>(
  handler: Handler<P>,
  options: { csrf?: boolean } = {},
) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const started = Date.now();
    let status = 200;
    try {
      if (options.csrf !== false && MUTATIONS.has(req.method)) assertSameOrigin(req);
      const params = (await context.params) ?? ({} as P);
      const result = await handler(req, { params, requestId });
      const response =
        result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      response.headers.set("x-request-id", requestId);
      status = response.status;
      return response;
    } catch (error) {
      const response = errorResponse(error, requestId);
      status = response.status;
      return response;
    } finally {
      logger.debug("api.request", {
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
        status,
        durationMs: Date.now() - started,
      });
    }
  };
}

/** Parse and validate a JSON body (spec §117: never trust frontend input). */
export async function parseBody<T extends z.ZodType>(
  req: NextRequest,
  schema: T,
  maxBytes = 1_000_000,
): Promise<z.infer<T>> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE");
  let json: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE");
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    if (isAppError(error)) throw error;
    throw new AppError("BAD_REQUEST", { message: "Request body must be valid JSON." });
  }
  return schema.parse(json);
}

export function searchParams(req: NextRequest): Record<string, string> {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

/** Read an uploaded file from multipart/form-data with a size limit. */
export async function readUpload(
  req: NextRequest,
  field: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; filename: string; type: string }> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > maxBytes + 64 * 1024) throw new AppError("PAYLOAD_TOO_LARGE");
  const form = await req.formData().catch(() => {
    throw new AppError("BAD_REQUEST", { message: "Expected a file upload." });
  });
  const file = form.get(field);
  if (!(file instanceof File))
    throw new AppError("BAD_REQUEST", { message: "No file was uploaded." });
  if (file.size > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE");
  return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, type: file.type };
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
