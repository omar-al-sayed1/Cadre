import { z } from "zod";
import { LIMITS } from "@repo/config";
import {
  DIFFICULTY_MODES,
  EXPERIENCE_LEVELS,
  INTERVIEW_TYPES,
  INTERVIEWER_PERSONALITIES,
  LANGUAGE_CODES,
  QUESTION_DIFFICULTIES,
  QUESTION_SOURCES,
  QUESTION_TYPES,
  RESPONSE_MODES,
} from "@repo/shared";
import { categoryWeightsSchema, DEFAULT_CATEGORY_WEIGHTS } from "./company";
import { idSchema, optionalText, requiredText, stringArray } from "./common";

/** Recruiter control over interviewer behaviour (spec §122). */
export const templateAiSettingsSchema = z.object({
  allowDynamicQuestions: z.boolean().default(true),
  allowFollowUps: z.boolean().default(true),
  maxFollowUpsPerQuestion: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.interview.absoluteMaxFollowUps)
    .default(LIMITS.interview.defaultMaxFollowUps),
  adaptiveDifficulty: z.boolean().default(true),
  resumeQuestions: z.boolean().default(true),
  candidateQuestionsAtEnd: z.boolean().default(true),
  askAnythingToAdd: z.boolean().default(true),
  strictTimeLimit: z.boolean().default(false),
  recordingEnabled: z.boolean().default(false),
  integrityMonitoring: z.boolean().default(true),
  allowLanguageSwitch: z.boolean().default(false),
  showEvaluationToReviewers: z.boolean().default(true),
  /** Seconds of silence before a gentle nudge, and before offering to repeat. */
  silenceNudgeSeconds: z.number().int().min(5).max(120).default(20),
  silenceRepeatSeconds: z.number().int().min(10).max(300).default(45),
});
export type TemplateAiSettings = z.infer<typeof templateAiSettingsSchema>;
export type TemplateAiSettingsInput = z.input<typeof templateAiSettingsSchema>;

export function parseTemplateAiSettings(value: unknown): TemplateAiSettings {
  const parsed = templateAiSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : templateAiSettingsSchema.parse({});
}

export const scoringConfigSchema = z.object({
  categoryWeights: categoryWeightsSchema.default(DEFAULT_CATEGORY_WEIGHTS),
});
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export function parseScoringConfig(value: unknown): ScoringConfig {
  const parsed = scoringConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : scoringConfigSchema.parse({});
}

export const CODE_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "csharp",
  "go",
  "cpp",
  "sql",
] as const;

export const codingConfigSchema = z.object({
  allowedLanguages: z.array(z.enum(CODE_LANGUAGES)).min(1).default(["javascript", "python"]),
  starterCode: z.record(z.string(), z.string().max(10_000)).default({}),
  testCases: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        input: z.string().max(10_000),
        expectedOutput: z.string().max(10_000),
        hidden: z.boolean().default(false),
      }),
    )
    .max(30)
    .default([]),
  timeLimitMs: z.number().int().min(500).max(10_000).default(3_000),
});
export type CodingConfig = z.infer<typeof codingConfigSchema>;

export const questionInputSchema = z.object({
  id: idSchema.optional(),
  text: requiredText(2_000, "Question text"),
  type: z.enum(QUESTION_TYPES).default("TECHNICAL"),
  difficulty: z.enum(QUESTION_DIFFICULTIES).default("MEDIUM"),
  skillId: idSchema.optional().nullable(),
  weight: z.number().int().min(1).max(10).default(1),
  expectedTopics: stringArray(20, 200),
  idealAnswer: optionalText(5_000),
  redFlags: stringArray(10, 300),
  followUpGuidance: optionalText(2_000),
  mandatory: z.boolean().default(false),
  source: z.enum(QUESTION_SOURCES).default("FIXED"),
  bankItemId: idSchema.optional().nullable(),
  codingConfig: codingConfigSchema.optional().nullable(),
});
export type QuestionInput = z.input<typeof questionInputSchema>;
export type QuestionData = z.infer<typeof questionInputSchema>;

export const sectionInputSchema = z
  .object({
    id: idSchema.optional(),
    name: requiredText(120, "Section name"),
    description: optionalText(1_000),
    targetDurationMinutes: z.number().int().min(1).max(60).default(5),
    minQuestions: z.number().int().min(0).max(20).default(1),
    maxQuestions: z.number().int().min(1).max(30).default(4),
    weight: z.number().int().min(0).max(100).default(0),
    focusSkillIds: z.array(idSchema).max(20).default([]),
    questions: z.array(questionInputSchema).max(40).default([]),
  })
  .refine((s) => s.minQuestions <= s.maxQuestions, {
    message: "Minimum questions can't exceed maximum",
    path: ["maxQuestions"],
  });
export type SectionInput = z.input<typeof sectionInputSchema>;
export type SectionData = z.infer<typeof sectionInputSchema>;

const templateMetaFields = {
  name: requiredText(160, "Interview name"),
  description: optionalText(2_000),
  type: z.enum(INTERVIEW_TYPES).default("MIXED"),
  durationMinutes: z
    .number()
    .int()
    .min(LIMITS.interview.minDurationMinutes)
    .max(LIMITS.interview.maxDurationMinutes)
    .default(LIMITS.interview.defaultDurationMinutes),
  minQuestions: z.number().int().min(1).max(50).default(5),
  maxQuestions: z.number().int().min(1).max(60).default(15),
  difficulty: z.enum(DIFFICULTY_MODES).default("ADAPTIVE"),
  language: z.enum(LANGUAGE_CODES).default("en"),
  responseMode: z.enum(RESPONSE_MODES).default("VOICE_AND_TEXT"),
  personality: z.enum(INTERVIEWER_PERSONALITIES).default("PROFESSIONAL"),
  interviewerName: optionalText(40),
  voice: optionalText(60),
  aiSettings: templateAiSettingsSchema.default(templateAiSettingsSchema.parse({})),
  scoringConfig: scoringConfigSchema.default(scoringConfigSchema.parse({})),
};

/** Full template document saved by the interview builder in one transaction. */
export const templateDocumentSchema = z
  .object({
    ...templateMetaFields,
    sections: z.array(sectionInputSchema).min(1, "Add at least one section").max(15),
  })
  .refine((t) => t.minQuestions <= t.maxQuestions, {
    message: "Minimum questions can't exceed maximum",
    path: ["maxQuestions"],
  });
export type TemplateDocumentInput = z.input<typeof templateDocumentSchema>;
export type TemplateDocument = z.infer<typeof templateDocumentSchema>;

export const createTemplateSchema = z.object({
  jobId: idSchema,
  document: templateDocumentSchema,
});
export type CreateTemplateInput = z.input<typeof createTemplateSchema>;

export const generateTemplateSchema = z.object({
  jobId: idSchema,
  durationMinutes: templateMetaFields.durationMinutes,
  interviewType: z.enum(INTERVIEW_TYPES).default("MIXED"),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  language: z.enum(LANGUAGE_CODES).default("en"),
  additionalInstructions: optionalText(2_000),
});
export type GenerateTemplateInput = z.input<typeof generateTemplateSchema>;

export const regenerateQuestionSchema = z.object({
  jobId: idSchema,
  sectionName: requiredText(120),
  skillId: idSchema.optional().nullable(),
  type: z.enum(QUESTION_TYPES).default("TECHNICAL"),
  difficulty: z.enum(QUESTION_DIFFICULTIES).default("MEDIUM"),
  avoid: z.array(z.string().max(2_000)).max(40).default([]),
});
export type RegenerateQuestionInput = z.input<typeof regenerateQuestionSchema>;

/** Question bank (§123). */
export const questionBankItemSchema = questionInputSchema
  .omit({ id: true, mandatory: true, source: true, bankItemId: true, codingConfig: true })
  .extend({ tags: stringArray(15, 40) });
export type QuestionBankItemInput = z.input<typeof questionBankItemSchema>;

export const questionBankQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
  tag: z.string().trim().max(40).optional(),
  skillId: idSchema.optional(),
});

/** Future CSV import row (§124). */
export const questionCsvRowSchema = z.object({
  question: requiredText(2_000, "question"),
  type: z.enum(QUESTION_TYPES).default("TECHNICAL"),
  skill: z.string().trim().max(80).optional(),
  difficulty: z.enum(QUESTION_DIFFICULTIES).default("MEDIUM"),
  expected_answer: optionalText(5_000),
  weight: z.coerce.number().int().min(1).max(10).default(1),
  tags: z.string().trim().max(400).optional(),
});
export type QuestionCsvRow = z.infer<typeof questionCsvRowSchema>;
