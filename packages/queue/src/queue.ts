import {
  asJson,
  db,
  isUniqueConstraintError,
  type BackgroundJob,
  type TransactionClient,
} from "@repo/database";
import { backoffDelay } from "@repo/shared";
import { jobPayloadSchemas, type JobName, type JobPayload } from "./jobs";

export interface EnqueueOptions {
  /** Idempotency key: a second enqueue with the same key returns the existing job. */
  uniqueKey?: string;
  runAt?: Date;
  maxAttempts?: number;
  /** Enqueue inside an existing transaction so the job commits atomically with the data. */
  tx?: TransactionClient;
}

/**
 * Durable job queue on PostgreSQL (table `background_job`).
 * - claim uses `FOR UPDATE SKIP LOCKED`, so any number of workers can run safely
 * - failures retry with exponential backoff until maxAttempts, then stay FAILED
 *   (inspectable and manually retryable from the admin panel)
 */
export class PostgresJobQueue {
  async enqueue<N extends JobName>(
    name: N,
    payload: JobPayload<N>,
    options: EnqueueOptions = {},
  ): Promise<BackgroundJob> {
    const parsed = jobPayloadSchemas[name].parse(payload);
    const client = options.tx ?? db;
    try {
      return await client.backgroundJob.create({
        data: {
          name,
          payload: asJson(parsed),
          uniqueKey: options.uniqueKey,
          runAt: options.runAt ?? new Date(),
          maxAttempts: options.maxAttempts ?? 5,
        },
      });
    } catch (error) {
      if (options.uniqueKey && isUniqueConstraintError(error)) {
        const existing = await client.backgroundJob.findUnique({
          where: { uniqueKey: options.uniqueKey },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async claim(
    workerId: string,
    names: readonly JobName[],
    limit: number,
  ): Promise<BackgroundJob[]> {
    if (limit <= 0 || names.length === 0) return [];
    return db.$queryRaw<BackgroundJob[]>`
      UPDATE "background_job"
      SET "status" = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId},
          "attempts" = "attempts" + 1, "startedAt" = now(), "updatedAt" = now()
      WHERE "id" IN (
        SELECT "id" FROM "background_job"
        WHERE "status" = 'PENDING' AND "runAt" <= now() AND "name" = ANY(${names as string[]})
        ORDER BY "runAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
  }

  async complete(jobId: string, durationMs: number): Promise<void> {
    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        durationMs,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }

  async fail(
    job: Pick<BackgroundJob, "id" | "attempts" | "maxAttempts">,
    error: unknown,
    retryable = true,
  ): Promise<"RETRY" | "FAILED"> {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const exhausted = !retryable || job.attempts >= job.maxAttempts;
    await db.backgroundJob.update({
      where: { id: job.id },
      data: exhausted
        ? { status: "FAILED", lastError: message.slice(0, 2_000), lockedAt: null, lockedBy: null }
        : {
            status: "PENDING",
            lastError: message.slice(0, 2_000),
            lockedAt: null,
            lockedBy: null,
            runAt: new Date(Date.now() + backoffDelay(job.attempts, 5_000, 15 * 60_000)),
          },
    });
    return exhausted ? "FAILED" : "RETRY";
  }

  /** Return jobs whose worker died mid-run to the queue. */
  async recoverStale(staleAfterMs: number): Promise<number> {
    const result = await db.backgroundJob.updateMany({
      where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - staleAfterMs) } },
      data: { status: "PENDING", lockedAt: null, lockedBy: null, runAt: new Date() },
    });
    return result.count;
  }

  async retry(jobId: string): Promise<void> {
    await db.backgroundJob.update({
      where: { id: jobId },
      data: { status: "PENDING", runAt: new Date(), attempts: 0, lastError: null },
    });
  }

  async cancel(jobId: string): Promise<void> {
    await db.backgroundJob.updateMany({
      where: { id: jobId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "CANCELLED" },
    });
  }

  async stats(): Promise<Record<string, number>> {
    const rows = await db.backgroundJob.groupBy({ by: ["status"], _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }
}

export const jobQueue = new PostgresJobQueue();
