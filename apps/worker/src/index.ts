import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  quiet: true,
});

/**
 * Background worker (spec §87). Run one or more of these alongside the web app:
 * evaluations, resume parsing, emails, reminders, expiry, retention and cleanup.
 * Jobs are claimed with SKIP LOCKED, so horizontal scaling is safe.
 */
async function main(): Promise<void> {
  const [{ getServerEnv }, { JobWorker }, { jobHandlers }, { logger }, { disconnectDb }] =
    await Promise.all([
      import("@repo/config/env"),
      import("@repo/queue"),
      import("@repo/core/jobs"),
      import("@repo/shared"),
      import("@repo/database"),
    ]);
  const env = getServerEnv();
  const worker = new JobWorker(jobHandlers, {
    concurrency: env.WORKER_CONCURRENCY,
    pollIntervalMs: 1_000,
    schedule: process.env.WORKER_SCHEDULER !== "false",
  });
  worker.start();
  logger.info("worker.ready", { demoMode: env.DEMO_MODE, concurrency: env.WORKER_CONCURRENCY });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("worker.shutdown", { signal });
    await worker.stop();
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Worker failed to start", error);
  process.exit(1);
});
