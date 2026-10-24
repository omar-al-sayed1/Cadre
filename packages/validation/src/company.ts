import { z } from "zod";
import { LIMITS, brand } from "@repo/config";
import { COMPANY_ROLES, COMPANY_SIZES, LANGUAGE_CODES } from "@repo/shared";
import { emailSchema, hexColor, optionalText, optionalUrl, requiredText } from "./common";

export const RETENTION_OPTIONS = [30, 90, 180, 365] as const;

export const createCompanySchema = z.object({
  name: requiredText(120, "Company name"),
  website: optionalUrl,
  industry: optionalText(120),
  size: z.enum(COMPANY_SIZES).optional().nullable(),
  country: optionalText(80),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
});
export type CreateCompanyInput = z.input<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial().extend({
  primaryColor: hexColor.optional().nullable(),
  welcomeText: optionalText(1_000),
});
export type UpdateCompanyInput = z.input<typeof updateCompanySchema>;

/** Category weights of the scoring rubric (must total 100). */
export const categoryWeightsSchema = z
  .object({
    technical: z.number().int().min(0).max(100).default(50),
    communication: z.number().int().min(0).max(100).default(15),
    problemSolving: z.number().int().min(0).max(100).default(15),
    experience: z.number().int().min(0).max(100).default(10),
    behavioral: z.number().int().min(0).max(100).default(10),
  })
  .refine(
    (w) => w.technical + w.communication + w.problemSolving + w.experience + w.behavioral === 100,
    "Category weights must add up to 100",
  );
export type CategoryWeights = z.infer<typeof categoryWeightsSchema>;

export const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
  technical: 50,
  communication: 15,
  problemSolving: 15,
  experience: 10,
  behavioral: 10,
};

export const companySettingsSchema = z.object({
  defaultLanguage: z.enum(LANGUAGE_CODES).default("en"),
  defaultDurationMinutes: z
    .number()
    .int()
    .min(LIMITS.interview.minDurationMinutes)
    .max(LIMITS.interview.maxDurationMinutes)
    .default(LIMITS.interview.defaultDurationMinutes),
  interviewerName: z.string().trim().min(1).max(40).default(brand.defaultInterviewerName),
  interviewerVoice: z.string().trim().max(60).default("ava"),
  voiceSpeed: z.number().min(0.75).max(1.25).default(1),
  retentionDays: z.literal(RETENTION_OPTIONS).default(180),
  recordingEnabled: z.boolean().default(false),
  cameraEnabled: z.boolean().default(false),
  integrityMonitoring: z.boolean().default(true),
  candidateFeedbackEnabled: z.boolean().default(true),
  showScoresToCandidate: z.boolean().default(false),
  showAiEvaluationToReviewers: z.boolean().default(true),
  notifications: z
    .object({
      candidateInvitation: z.boolean().default(true),
      candidateReminders: z.boolean().default(true),
      candidateCompletion: z.boolean().default(true),
      recruiterCompletion: z.boolean().default(true),
    })
    .default({
      candidateInvitation: true,
      candidateReminders: true,
      candidateCompletion: true,
      recruiterCompletion: true,
    }),
  reminderHoursBeforeExpiry: z.array(z.number().int().min(1).max(168)).max(3).default([24, 3]),
  categoryWeights: categoryWeightsSchema.default(DEFAULT_CATEGORY_WEIGHTS),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;
export type CompanySettingsInput = z.input<typeof companySettingsSchema>;

/** Parse stored JSON settings, filling defaults and dropping invalid values. */
export function parseCompanySettings(value: unknown): CompanySettings {
  const parsed = companySettingsSchema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;
  // Fall back field-by-field: keep valid stored values, default the rest.
  const base = companySettingsSchema.parse({});
  if (value && typeof value === "object") {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const field = (companySettingsSchema.shape as Record<string, z.ZodType>)[key];
      if (!field) continue;
      const result = field.safeParse(raw);
      if (result.success) (base as Record<string, unknown>)[key] = result.data;
    }
  }
  return base;
}

export const updateCompanySettingsSchema = companySettingsSchema.partial();
export type UpdateCompanySettingsInput = z.input<typeof updateCompanySettingsSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(COMPANY_ROLES),
});
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(COMPANY_ROLES),
});

export const acceptTeamInviteSchema = z.object({
  token: z.string().trim().min(32).max(128),
});
