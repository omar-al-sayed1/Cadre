/**
 * Application error model. Every error that crosses an API boundary is an
 * AppError with a stable code and a user-safe message; internals stay in logs.
 */
export const ERROR_CODES = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  PLAN_LIMIT_REACHED: 402,
  PRODUCT_NOT_ENABLED: 403,
  INVITATION_INVALID: 404,
  INVITATION_EXPIRED: 410,
  INVITATION_EXHAUSTED: 410,
  SESSION_INVALID: 401,
  SESSION_STATE_CONFLICT: 409,
  SESSION_BUSY: 409,
  AI_UNAVAILABLE: 503,
  SPEECH_UNAVAILABLE: 503,
  STORAGE_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: "The request could not be processed.",
  VALIDATION_FAILED: "Some of the submitted information is invalid.",
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: "This change conflicts with the current state. Refresh and try again.",
  GONE: "This resource is no longer available.",
  PAYLOAD_TOO_LARGE: "The uploaded file is too large.",
  UNSUPPORTED_MEDIA_TYPE: "This file type isn't supported.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  PRODUCT_NOT_ENABLED:
    "This AI employee isn't active for your workspace. Start a trial or subscribe in the AI Marketplace.",
  PLAN_LIMIT_REACHED: "Your plan's usage limit has been reached.",
  INVITATION_INVALID:
    "This interview link is invalid. Please check the link in your invitation email.",
  INVITATION_EXPIRED:
    "This interview invitation has expired. Please contact the recruiter for a new link.",
  INVITATION_EXHAUSTED: "This interview has already been completed or no attempts remain.",
  SESSION_INVALID:
    "Your interview session could not be verified. Please reopen your interview link.",
  SESSION_STATE_CONFLICT: "The interview is not in a state that allows this action.",
  SESSION_BUSY: "We're still processing your previous answer.",
  AI_UNAVAILABLE: "We're having trouble generating the next question. Please try again.",
  SPEECH_UNAVAILABLE: "Speech processing is temporarily unavailable. You can continue by typing.",
  STORAGE_UNAVAILABLE: "File storage is temporarily unavailable. Please try again.",
  SERVICE_UNAVAILABLE: "An outside service is temporarily unavailable. Please try again.",
  INTERNAL: "Something went wrong on our side. Please try again.",
};

export interface AppErrorOptions {
  message?: string;
  details?: unknown;
  cause?: unknown;
  /** Extra fields safe to return to clients (e.g. field errors, retryAfter). */
  expose?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly expose?: Record<string, unknown>;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? DEFAULT_MESSAGES[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = options.details;
    this.expose = options.expose;
  }

  toJSON(): { error: { code: ErrorCode; message: string } & Record<string, unknown> } {
    return { error: { code: this.code, message: this.message, ...(this.expose ?? {}) } };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function defaultErrorMessage(code: ErrorCode): string {
  return DEFAULT_MESSAGES[code];
}

/** Shape returned by every API error response. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fieldErrors?: Record<string, string[]>;
    retryAfter?: number;
  };
}

export const notFound = (what = "Resource") =>
  new AppError("NOT_FOUND", { message: `${what} not found.` });
export const forbidden = (message?: string) => new AppError("FORBIDDEN", { message });
export const conflict = (message?: string) => new AppError("CONFLICT", { message });
export const badRequest = (message?: string) => new AppError("BAD_REQUEST", { message });
