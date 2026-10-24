/**
 * Runs once when the Next.js server starts. In development (QUEUE_INLINE_WORKER=true)
 * the background job worker runs inside the web process so no second terminal is
 * needed. In production run `apps/worker` as a separate, horizontally scalable process.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!["true", "1", "yes"].includes(process.env.QUEUE_INLINE_WORKER ?? "")) return;
  const globalForWorker = globalThis as unknown as { __inlineWorker?: boolean };
  if (globalForWorker.__inlineWorker) return;
  globalForWorker.__inlineWorker = true;

  const [{ JobWorker }, { jobHandlers }, { logger }] = await Promise.all([
    import("@repo/queue"),
    import("@repo/core/jobs"),
    import("@repo/shared"),
  ]);
  const worker = new JobWorker(jobHandlers, {
    concurrency: 2,
    pollIntervalMs: 1_000,
    schedule: true,
  });
  worker.start();
  logger.info("inline_worker.started");
}
