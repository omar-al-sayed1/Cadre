import { z } from "zod";
import { CANDIDATE_STAGES, MANUAL_CANDIDATE_STAGES, RECOMMENDATIONS } from "@repo/shared";
import {
  emailSchema,
  idSchema,
  optionalText,
  optionalUrl,
  paginationSchema,
  requiredText,
} from "./common";

export const createCandidateSchema = z.object({
  firstName: requiredText(80, "First name"),
  lastName: z.string().trim().max(80).default(""),
  email: emailSchema,
  phone: optionalText(40),
  linkedinUrl: optionalUrl,
  location: optionalText(120),
  source: optionalText(60),
  /** Optionally attach the candidate to a job immediately. */
  jobId: idSchema.optional(),
});
export type CreateCandidateInput = z.input<typeof createCandidateSchema>;
export type CreateCandidateData = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = createCandidateSchema.omit({ jobId: true }).partial();
export type UpdateCandidateInput = z.input<typeof updateCandidateSchema>;

/** One CSV row (header names are matched case-insensitively). */
export const candidateCsvRowSchema = z.object({
  first_name: requiredText(80, "first_name"),
  last_name: z.string().trim().max(80).default(""),
  email: emailSchema,
  phone: optionalText(40),
  linkedin: optionalUrl,
  location: optionalText(120),
});
export type CandidateCsvRow = z.infer<typeof candidateCsvRowSchema>;

export const CANDIDATE_SORTS = ["newest", "oldest", "score_desc", "score_asc", "name"] as const;

export const candidateListQuerySchema = paginationSchema.extend({
  jobId: idSchema.optional(),
  stage: z.enum(CANDIDATE_STAGES).optional(),
  recommendation: z.enum(RECOMMENDATIONS).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  interviewedFrom: z.coerce.date().optional(),
  interviewedTo: z.coerce.date().optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(CANDIDATE_SORTS).default("newest"),
});
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;

export const updateStageSchema = z.object({
  stage: z.enum(MANUAL_CANDIDATE_STAGES),
  reason: optionalText(500),
});
export type UpdateStageInput = z.input<typeof updateStageSchema>;

export const manualRatingSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
});

export const attachToJobSchema = z.object({
  jobId: idSchema,
});

export const privacyDeletionSchema = z.object({
  scope: z
    .object({
      candidate: z.boolean().default(false),
      resume: z.boolean().default(false),
      transcript: z.boolean().default(false),
      audio: z.boolean().default(false),
      evaluation: z.boolean().default(false),
    })
    .refine((s) => Object.values(s).some(Boolean), "Select at least one data category"),
  confirmation: z.literal("DELETE"),
});
export type PrivacyDeletionInput = z.input<typeof privacyDeletionSchema>;
