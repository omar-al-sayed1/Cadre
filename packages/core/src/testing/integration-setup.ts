import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach } from "vitest";
import { testDatabaseUrl } from "./test-database";

/**
 * Per-file setup for integration tests: point every service at the test
 * database, force demo providers (no paid APIs, no network) and start each test
 * from empty tables.
 */
process.env.DATABASE_URL = testDatabaseUrl();
Object.assign(process.env, {
  NODE_ENV: "test",
  DEMO_MODE: "true",
  AI_PROVIDER: "mock",
  STT_PROVIDER: "browser",
  TTS_PROVIDER: "browser",
  EMAIL_PROVIDER: "console",
  QUEUE_INLINE_WORKER: "false",
  STORAGE_PROVIDER: "local",
  STORAGE_LOCAL_DIR: mkdtempSync(path.join(tmpdir(), "aii-test-uploads-")),
  APP_URL: "http://localhost:3000",
  LOG_LEVEL: "error",
  RESEARCH_PROVIDER: "none",
  DISCOVERY_PROVIDER: "samples",
});
process.env.AUTH_SECRET ??= "integration-test-secret-integration-test-secret";

const { db, disconnectDb } = await import("@repo/database");
const { DemoInterviewAI } = await import("@repo/ai");
const { setInterviewAIForTesting } = await import("../runtime");

let truncateSql: string | null = null;

async function resetDatabase(): Promise<void> {
  if (!truncateSql) {
    const tables = await db.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    truncateSql = `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`;
  }
  await db.$executeRawUnsafe(truncateSql);
}

beforeEach(async () => {
  setInterviewAIForTesting(new DemoInterviewAI());
  await resetDatabase();
});

afterAll(async () => {
  setInterviewAIForTesting(undefined);
  await disconnectDb();
});
