import { z } from "zod";

/**
 * Server-side environment, validated once and cached.
 * Never import this from client components — it contains secrets.
 */

const bool = (defaultValue: boolean) =>
  z
    .enum(["true", "false", "1", "0", "yes", "no", ""])
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? defaultValue : ["true", "1", "yes"].includes(v),
    );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const intWithDefault = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? Number.parseInt(v, 10) : defaultValue))
    .pipe(z.number().int().nonnegative());

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    APP_NAME: optionalString,
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    DEMO_MODE: bool(false),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_POOL_MAX: intWithDefault(10),

    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    AUTH_REQUIRE_EMAIL_VERIFICATION: bool(true),
    AUTH_TRUSTED_ORIGINS: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    CANDIDATE_SESSION_SECRET: optionalString,

    AI_PROVIDER: z.enum(["anthropic", "openai", "ollama", "mock"]).default("anthropic"),
    AI_MODEL: optionalString,
    AI_FAST_MODEL: optionalString,
    AI_API_KEY: optionalString,
    AI_BASE_URL: optionalString,
    /** Optional separate model for the AI Sales Agent (applies even when DEMO_MODE=true). */
    SALES_AI_PROVIDER: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.enum(["anthropic", "openai", "ollama", "mock"]).optional(),
    ),
    SALES_AI_MODEL: optionalString,
    SALES_AI_BASE_URL: optionalString,
    SALES_AI_API_KEY: optionalString,
    AI_TIMEOUT_MS: intWithDefault(45_000),
    AI_MAX_RETRIES: intWithDefault(2),

    STT_PROVIDER: z.enum(["openai", "deepgram", "browser", "mock"]).default("browser"),
    STT_API_KEY: optionalString,
    STT_MODEL: optionalString,
    TTS_PROVIDER: z.enum(["openai", "elevenlabs", "browser", "mock"]).default("browser"),
    TTS_API_KEY: optionalString,
    TTS_MODEL: optionalString,

    STORAGE_PROVIDER: z.enum(["local", "s3", "r2", "supabase"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default(".data/uploads"),
    STORAGE_BUCKET: optionalString,
    STORAGE_REGION: z.string().default("auto"),
    STORAGE_ENDPOINT: optionalString,
    STORAGE_ACCESS_KEY: optionalString,
    STORAGE_SECRET_KEY: optionalString,
    STORAGE_FORCE_PATH_STYLE: bool(false),

    QUEUE_DRIVER: z.enum(["postgres"]).default("postgres"),
    QUEUE_INLINE_WORKER: bool(false),
    WORKER_CONCURRENCY: intWithDefault(4),
    REDIS_URL: optionalString,

    EMAIL_PROVIDER: z.enum(["console", "resend", "smtp"]).default("console"),
    EMAIL_API_KEY: optionalString,
    EMAIL_FROM: z.string().default("AI Interviewer <no-reply@example.com>"),
    SMTP_URL: optionalString,

    CODE_EXECUTION_PROVIDER: z.enum(["disabled", "piston"]).default("disabled"),
    /** AI Sales Agent research: "website" reads the lead's own public site; "none" uses the lead record only. */
    RESEARCH_PROVIDER: z.enum(["website", "none"]).default("website"),
    /** agent: Cadre's own prospecting agent (open data + public websites); samples: fictional demo data; off. */
    DISCOVERY_PROVIDER: z.enum(["agent", "samples", "off"]).default("agent"),
    /** Also let Claude's built-in web search suggest companies (needs the Anthropic provider). */
    DISCOVERY_CLAUDE_WEB_SEARCH: bool(false),
    /** Overpass endpoints, comma-separated, tried in order (public servers are often busy). */
    OVERPASS_URL: z
      .string()
      .default(
        "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter",
      ),
    WIKIDATA_SPARQL_URL: z.url().default("https://query.wikidata.org/sparql"),
    CODE_EXECUTION_URL: optionalString,

    SENTRY_DSN: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DEMO_MODE === false) {
      if (env.AI_PROVIDER !== "mock" && env.AI_PROVIDER !== "ollama" && !env.AI_API_KEY) {
        ctx.addIssue({ code: "custom", path: ["AI_API_KEY"], message: "AI_API_KEY is required" });
      }
    }
    if (env.STORAGE_PROVIDER !== "local" && !env.STORAGE_BUCKET) {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_BUCKET"],
        message: "STORAGE_BUCKET is required for remote storage providers",
      });
    }
    if (env.EMAIL_PROVIDER === "resend" && !env.EMAIL_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_API_KEY"],
        message: "EMAIL_API_KEY is required for resend",
      });
    }
    if (env.EMAIL_PROVIDER === "smtp" && !env.SMTP_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_URL"],
        message: "SMTP_URL is required for smtp",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: override env values without mutating process.env. */
export function setServerEnvForTesting(overrides: Partial<ServerEnv> | undefined): void {
  if (overrides === undefined) {
    cached = undefined;
    return;
  }
  const base = serverEnvSchema.parse({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
    ...process.env,
  });
  cached = { ...base, ...overrides };
}

export function isDemoMode(): boolean {
  return getServerEnv().DEMO_MODE;
}
