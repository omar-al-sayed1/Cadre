import { z } from "zod";

/**
 * Background job catalogue. Every payload is validated when enqueued and again
 * when processed, so a malformed job fails loudly instead of half-running.
 */
export const jobPayloadSchemas = {
  "interview.evaluate": z.object({ sessionId: z.string(), force: z.boolean().default(false) }),
  "interview.post-completion": z.object({ sessionId: z.string() }),
  "resume.parse": z.object({ resumeId: z.string() }),
  "email.send": z.object({
    to: z.string(),
    subject: z.string(),
    html: z.string(),
    text: z.string(),
    idempotencyKey: z.string().optional(),
    companyId: z.string().optional(),
  }),
  "invitations.send-reminders": z.object({}).default({}),
  "invitations.expire": z.object({}).default({}),
  "sessions.expire-abandoned": z.object({}).default({}),
  "retention.sweep": z.object({}).default({}),
  "privacy.delete": z.object({ requestId: z.string() }),
  "maintenance.cleanup": z.object({}).default({}),
  "sales.rescore-leads": z.object({ companyId: z.string() }),
  "sales.research-lead": z.object({ researchId: z.string() }),
  "sales.discover-leads": z.object({ runId: z.string() }),
} as const;

export type JobName = keyof typeof jobPayloadSchemas;
export type JobPayload<N extends JobName> = z.input<(typeof jobPayloadSchemas)[N]>;
export type ParsedJobPayload<N extends JobName> = z.infer<(typeof jobPayloadSchemas)[N]>;

export const JOB_NAMES = Object.keys(jobPayloadSchemas) as JobName[];

/** Recurring maintenance jobs and their intervals (seconds). */
export const RECURRING_JOBS: Array<{ name: JobName; everySeconds: number }> = [
  { name: "invitations.send-reminders", everySeconds: 15 * 60 },
  { name: "invitations.expire", everySeconds: 15 * 60 },
  { name: "sessions.expire-abandoned", everySeconds: 10 * 60 },
  { name: "retention.sweep", everySeconds: 6 * 60 * 60 },
  { name: "maintenance.cleanup", everySeconds: 60 * 60 },
];
