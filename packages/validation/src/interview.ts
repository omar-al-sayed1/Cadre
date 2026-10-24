import { z } from "zod";
import { LIMITS } from "@repo/config";
import {
  ANSWER_SOURCES,
  FEEDBACK_ACCURACIES,
  INTEGRITY_EVENT_TYPES,
  RECOMMENDATIONS,
  RESPONSE_MODES,
} from "@repo/shared";
import { CODE_LANGUAGES } from "./template";
import { emailSchema, idSchema, idempotencyKeySchema, optionalText, requiredText } from "./common";
import { createCandidateSchema } from "./candidate";

// ─────────────── Invitations (recruiter side) ───────────────

export const createInvitationSchema = z
  .object({
    templateId: idSchema,
    candidateId: idSchema.optional(),
    candidate: createCandidateSchema.omit({ jobId: true }).optional(),
    expiresInDays: z
      .number()
      .int()
      .min(1)
      .max(60)
      .default(LIMITS.interview.invitationDefaultExpiryDays),
    maxAttempts: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(LIMITS.interview.invitationDefaultMaxAttempts),
    sendEmail: z.boolean().default(true),
  })
  .refine((v) => Boolean(v.candidateId) !== Boolean(v.candidate), {
    message: "Provide either an existing candidate or new candidate details",
    path: ["candidateId"],
  });
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

export const bulkInvitationSchema = z.object({
  templateId: idSchema,
  candidateIds: z.array(idSchema).min(1).max(200),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(LIMITS.interview.invitationDefaultExpiryDays),
  maxAttempts: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(LIMITS.interview.invitationDefaultMaxAttempts),
  sendEmail: z.boolean().default(true),
});

// ─────────────── Candidate interview session ───────────────

export const beginSessionSchema = z.object({
  confirmedName: requiredText(160, "Your name"),
  confirmedEmail: emailSchema.optional(),
  consents: z.object({
    terms: z.literal(true, { error: "You must accept the interview terms" }),
    privacy: z.literal(true, { error: "You must accept the privacy notice" }),
    aiInterview: z.literal(true, { error: "You must acknowledge the AI interview" }),
    recording: z.boolean().default(false),
    camera: z.boolean().default(false),
  }),
  preferredMode: z.enum(RESPONSE_MODES).optional(),
});
export type BeginSessionInput = z.input<typeof beginSessionSchema>;

export const candidateMessageSchema = z.object({
  clientMessageId: idempotencyKeySchema,
  content: z.string().max(LIMITS.interview.maxAnswerChars).default(""),
  source: z.enum(ANSWER_SOURCES).default("TEXT"),
  /** Milliseconds between the end of the question and the start of the answer. */
  latencyMs: z.number().int().min(0).max(3_600_000).optional(),
  /** STT confidence when source = VOICE (0–1). */
  transcriptConfidence: z.number().min(0).max(1).optional(),
  code: z
    .object({
      language: z.enum(CODE_LANGUAGES),
      source: z.string().max(LIMITS.interview.maxCodeChars),
    })
    .optional(),
});
export type CandidateMessageInput = z.input<typeof candidateMessageSchema>;

export const integrityEventsSchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(INTEGRITY_EVENT_TYPES),
        occurredAt: z.coerce.date(),
        metadata: z
          .record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()]))
          .default({}),
      }),
    )
    .min(1)
    .max(50),
});
export type IntegrityEventsInput = z.input<typeof integrityEventsSchema>;

export const heartbeatSchema = z.object({
  clientState: z.string().trim().max(40).optional(),
  reconnected: z.boolean().default(false),
});

export const finishSessionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
});

export const candidateFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: optionalText(2_000),
});
export type CandidateFeedbackInput = z.input<typeof candidateFeedbackSchema>;

export const runCodeSchema = z.object({
  language: z.enum(CODE_LANGUAGES),
  source: z.string().min(1).max(LIMITS.interview.maxCodeChars),
  questionKey: z.string().trim().max(64),
});

// ─────────────── Recruiter review ───────────────

export const recruiterNoteSchema = z.object({
  content: requiredText(5_000, "Note"),
  applicationId: idSchema.optional(),
  sessionId: idSchema.optional(),
});
export type RecruiterNoteInput = z.input<typeof recruiterNoteSchema>;

export const overrideEvaluationSchema = z
  .object({
    score: z.number().int().min(0).max(100).nullable().optional(),
    recommendation: z.enum(RECOMMENDATIONS).nullable().optional(),
    reason: requiredText(1_000, "Reason"),
  })
  .refine(
    (v) => v.score !== undefined || v.recommendation !== undefined,
    "Change the score or the recommendation",
  );
export type OverrideEvaluationInput = z.input<typeof overrideEvaluationSchema>;

export const evaluationFeedbackSchema = z.object({
  accuracy: z.enum(FEEDBACK_ACCURACIES),
  correction: optionalText(2_000),
});
export type EvaluationFeedbackInput = z.input<typeof evaluationFeedbackSchema>;

export const compareQuerySchema = z.object({
  jobId: idSchema,
  candidateIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean).slice(0, 10) : [])),
});

export const terminateSessionSchema = z.object({
  reason: requiredText(500, "Reason"),
});
