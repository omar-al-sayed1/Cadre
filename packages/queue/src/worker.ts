import { randomBytes } from "node:crypto";
import { logger as rootLogger, sleep, type Logger } from "@repo/shared";
import { jobPayloadSchemas, RECURRING_JOBS, type JobName, type ParsedJobPayload } from "./jobs";
import { jobQueue, type PostgresJobQueue } from "./queue";

export interface JobContext {
  jobId: string;
  attempt: number;
  logger: Logger;
}

export type JobHandler<N extends JobName> = (
  payload: ParsedJobPayload<N>,
  ctx: JobContext,
) => Promise<void>;
export type JobHandlers = { [N in JobName]?: JobHandler<N> };

/** Throw from a handler to fail a job permanently (no retries). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export interface WorkerOptions {
  concurrency: number;
  pollIntervalMs?: number;
  staleAfterMs?: number;
  /** Enqueue recurring maintenance jobs (only one process should do this). */
  schedule?: boolean;
  queue?: PostgresJobQueue;
}

export class JobWorker {
  readonly id = `worker-${randomBytes(4).toString("hex")}`;
  private running = false;
  private active = 0;
  private loop: Promise<void> | undefined;
  private readonly queue: PostgresJobQueue;
  private readonly logger: Logger;
  private lastScheduled = new Map<JobName, number>();

  constructor(
    private readonly handlers: JobHandlers,
    private readonly options: WorkerOptions,
  ) {
    this.queue = options.queue ?? jobQueue;
    this.logger = rootLogger.child({ component: "worker", workerId: this.id });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info("worker.started", {
      concurrency: this.options.concurrency,
      jobs: Object.keys(this.handlers),
    });
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
    while (this.active > 0) await sleep(100);
    this.logger.info("worker.stopped");
  }

  private async run(): Promise<void> {
    const names = Object.keys(this.handlers) as JobName[];
    let lastStaleCheck = 0;
    while (this.running) {
      try {
        if (Date.now() - lastStaleCheck > 60_000) {
          lastStaleCheck = Date.now();
          const recovered = await this.queue.recoverStale(this.options.staleAfterMs ?? 15 * 60_000);
          if (recovered > 0) this.logger.warn("worker.recovered_stale_jobs", { count: recovered });
        }
        if (this.options.schedule) await this.scheduleRecurring();
        const capacity = this.options.concurrency - this.active;
        const jobs = capacity > 0 ? await this.queue.claim(this.id, names, capacity) : [];
        for (const job of jobs) void this.execute(job);
        if (jobs.length === 0) await sleep(this.options.pollIntervalMs ?? 1_000);
      } catch (error) {
        this.logger.error("worker.loop_error", { error });
        await sleep(5_000);
      }
    }
  }

  private async scheduleRecurring(): Promise<void> {
    const now = Date.now();
    for (const job of RECURRING_JOBS) {
      if (!this.handlers[job.name]) continue;
      const last = this.lastScheduled.get(job.name) ?? 0;
      if (now - last < job.everySeconds * 1_000) continue;
      this.lastScheduled.set(job.name, now);
      // The bucketed unique key makes concurrent schedulers enqueue each run once.
      const bucket = Math.floor(now / (job.everySeconds * 1_000));
      await this.queue.enqueue(job.name, {} as never, {
        uniqueKey: `recurring:${job.name}:${bucket}`,
        maxAttempts: 3,
      });
    }
  }

  private async execute(job: {
    id: string;
    name: string;
    payload: unknown;
    attempts: number;
    maxAttempts: number;
  }): Promise<void> {
    this.active += 1;
    const started = Date.now();
    const name = job.name as JobName;
    const log = this.logger.child({ jobId: job.id, job: name, attempt: job.attempts });
    try {
      const handler = this.handlers[name] as JobHandler<JobName> | undefined;
      if (!handler) throw new PermanentJobError(`No handler registered for ${name}`);
      const payload = jobPayloadSchemas[name].parse(job.payload);
      await handler(payload as never, { jobId: job.id, attempt: job.attempts, logger: log });
      await this.queue.complete(job.id, Date.now() - started);
      log.info("job.completed", { durationMs: Date.now() - started });
    } catch (error) {
      const outcome = await this.queue.fail(job, error, !(error instanceof PermanentJobError));
      log[outcome === "FAILED" ? "error" : "warn"]("job.failed", {
        outcome,
        error,
        durationMs: Date.now() - started,
      });
    } finally {
      this.active -= 1;
    }
  }
}
