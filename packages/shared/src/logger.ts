/**
 * Minimal structured logger.
 *
 * - Emits one JSON object per line in production (easy to ship to any log pipeline).
 * - Child loggers bind context such as requestId / sessionId / companyId.
 * - Sensitive keys are redacted recursively so secrets, tokens and candidate
 *   personal data never reach log storage by accident.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY_PATTERN =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential|private[-_]?key|signature|email|phone|ssn|transcript|content|resume|answer|prompt/i;

const SAFE_KEYS = new Set([
  "tokenHashPrefix",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "contentType",
  "contentLength",
  "promptVersion",
]);

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (!SAFE_KEYS.has(key) && SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redact(inner, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === "string" && value.length > 2_000)
    return `${value.slice(0, 2_000)}…[truncated]`;
  return value;
}

interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
  bindings?: LogContext;
}

class ConsoleLogger implements Logger {
  private readonly minLevel: number;

  constructor(private readonly options: LoggerOptions) {
    this.minLevel = LEVEL_ORDER[options.level ?? "info"];
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_ORDER[level] < this.minLevel) return;
    const entry = {
      level,
      time: new Date().toISOString(),
      msg: message,
      ...(redact({ ...this.options.bindings, ...context }) as LogContext),
    };
    const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (this.options.pretty) {
      const { level: _l, time, msg, ...rest } = entry;
      const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
      sink(`${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${msg}${extra}`);
    } else {
      sink(JSON.stringify(entry));
    }
  }

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }
  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }
  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }
  error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }
  child(bindings: LogContext): Logger {
    return new ConsoleLogger({
      ...this.options,
      bindings: { ...this.options.bindings, ...bindings },
    });
  }
}

function resolveLevel(): LogLevel {
  const raw = typeof process !== "undefined" ? process.env.LOG_LEVEL : undefined;
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const isProd = typeof process !== "undefined" && process.env.NODE_ENV === "production";
  return new ConsoleLogger({
    level: options.level ?? resolveLevel(),
    pretty: options.pretty ?? !isProd,
    bindings: options.bindings,
  });
}

/** Process-wide root logger. */
export const logger: Logger = createLogger();
