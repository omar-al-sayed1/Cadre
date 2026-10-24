import { z } from "zod";
import {
  DIFFICULTY_MODES,
  EXPERIENCE_LEVELS,
  INTERVIEW_TYPES,
  INTERVIEWER_PERSONALITIES,
  QUESTION_DIFFICULTIES,
  QUESTION_SOURCES,
  QUESTION_TYPES,
  RESPONSE_MODES,
  SKILL_CATEGORIES,
  SKILL_LEVELS,
} from "@repo/shared";
import {
  codingConfigSchema,
  scoringConfigSchema,
  templateAiSettingsSchema,
} from "@repo/validation";

/**
 * Immutable snapshot of an interview template, captured at publish time and
 * stored on InterviewTemplateVersion. Sessions run exclusively against this
 * snapshot, so editing a template never changes an interview in progress and
 * every report can be traced to the exact configuration used (spec §94).
 */
export const templateSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  templateId: z.string(),
  version: z.number().int().min(1),
  name: z.string(),
  type: z.enum(INTERVIEW_TYPES),
  durationMinutes: z.number().int().min(1),
  minQuestions: z.number().int().min(0),
  maxQuestions: z.number().int().min(1),
  difficulty: z.enum(DIFFICULTY_MODES),
  language: z.string(),
  responseMode: z.enum(RESPONSE_MODES),
  personality: z.enum(INTERVIEWER_PERSONALITIES),
  interviewerName: z.string(),
  voice: z.string().nullable(),
  aiSettings: templateAiSettingsSchema,
  scoringConfig: scoringConfigSchema,
  job: z.object({
    id: z.string(),
    title: z.string(),
    companyName: z.string(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS),
    description: z.string(),
    requirements: z.string(),
    responsibilities: z.string(),
  }),
  skills: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      category: z.enum(SKILL_CATEGORIES),
      weight: z.number().int().min(0).max(100),
      expectedLevel: z.enum(SKILL_LEVELS),
      critical: z.boolean(),
    }),
  ),
  sections: z
    .array(
      z.object({
        key: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        order: z.number().int(),
        targetDurationSeconds: z.number().int().min(30),
        minQuestions: z.number().int().min(0),
        maxQuestions: z.number().int().min(1),
        weight: z.number().int().min(0),
        focusSkillKeys: z.array(z.string()),
      }),
    )
    .min(1),
  questions: z.array(
    z.object({
      key: z.string(),
      sectionKey: z.string(),
      text: z.string(),
      type: z.enum(QUESTION_TYPES),
      difficulty: z.enum(QUESTION_DIFFICULTIES),
      skillKey: z.string().nullable(),
      weight: z.number().int(),
      expectedTopics: z.array(z.string()),
      idealAnswer: z.string().nullable(),
      redFlags: z.array(z.string()),
      followUpGuidance: z.string().nullable(),
      mandatory: z.boolean(),
      source: z.enum(QUESTION_SOURCES),
      order: z.number().int(),
      codingConfig: codingConfigSchema.nullable(),
    }),
  ),
  publishedAt: z.string(),
});

export type TemplateSnapshot = z.infer<typeof templateSnapshotSchema>;
export type SnapshotSection = TemplateSnapshot["sections"][number];
export type SnapshotQuestion = TemplateSnapshot["questions"][number];
export type SnapshotSkill = TemplateSnapshot["skills"][number];

export function parseSnapshot(value: unknown): TemplateSnapshot {
  return templateSnapshotSchema.parse(value);
}

export function orderedSections(snapshot: TemplateSnapshot): SnapshotSection[] {
  return [...snapshot.sections].sort((a, b) => a.order - b.order);
}

export function sectionQuestions(
  snapshot: TemplateSnapshot,
  sectionKey: string,
): SnapshotQuestion[] {
  return snapshot.questions
    .filter((q) => q.sectionKey === sectionKey)
    .sort((a, b) => a.order - b.order);
}

/** Skills a section covers: explicit focus skills plus skills of its questions. */
export function sectionSkillKeys(snapshot: TemplateSnapshot, section: SnapshotSection): string[] {
  const keys = new Set(section.focusSkillKeys);
  for (const q of sectionQuestions(snapshot, section.key)) {
    if (q.skillKey) keys.add(q.skillKey);
  }
  return [...keys].filter((k) => snapshot.skills.some((s) => s.key === k));
}

export function isClosingSection(snapshot: TemplateSnapshot, section: SnapshotSection): boolean {
  const questions = sectionQuestions(snapshot, section.key);
  return questions.length > 0 && questions.every((q) => q.type === "CLOSING");
}
