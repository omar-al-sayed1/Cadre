import type { QuestionData, SectionData, TemplateDocument } from "@repo/validation";
import { templateAiSettingsSchema, scoringConfigSchema } from "@repo/validation";

export type BuilderQuestion = QuestionData & { _key: string };
export type BuilderSection = Omit<SectionData, "questions"> & {
  _key: string;
  questions: BuilderQuestion[];
};
export type BuilderDocument = Omit<TemplateDocument, "sections"> & { sections: BuilderSection[] };

export interface BuilderSkill {
  id: string;
  name: string;
  weight: number;
}

export const key = () => Math.random().toString(36).slice(2, 10);

export function withKeys(doc: TemplateDocument): BuilderDocument {
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      _key: key(),
      questions: s.questions.map((q) => ({ ...q, _key: key() })),
    })),
  };
}

export function blankQuestion(skillId: string | null = null): BuilderQuestion {
  return {
    _key: key(),
    text: "",
    type: "TECHNICAL",
    difficulty: "MEDIUM",
    skillId,
    weight: 1,
    expectedTopics: [],
    idealAnswer: null,
    redFlags: [],
    followUpGuidance: null,
    mandatory: false,
    source: "FIXED",
  };
}

export function blankSection(name = "New section"): BuilderSection {
  return {
    _key: key(),
    name,
    description: null,
    targetDurationMinutes: 5,
    minQuestions: 1,
    maxQuestions: 3,
    weight: 0,
    focusSkillIds: [],
    questions: [blankQuestion()],
  };
}

export function blankDocument(jobTitle: string, durationMinutes = 30): BuilderDocument {
  return {
    name: `${jobTitle} — AI Interview`,
    description: null,
    type: "MIXED",
    durationMinutes,
    minQuestions: 5,
    maxQuestions: 15,
    difficulty: "ADAPTIVE",
    language: "en",
    responseMode: "VOICE_AND_TEXT",
    personality: "PROFESSIONAL",
    interviewerName: null,
    voice: null,
    aiSettings: templateAiSettingsSchema.parse({}),
    scoringConfig: scoringConfigSchema.parse({}),
    sections: [
      {
        ...blankSection("Introduction"),
        targetDurationMinutes: 3,
        questions: [
          {
            ...blankQuestion(),
            text: "Could you briefly introduce yourself and your most relevant recent experience?",
            type: "INTRODUCTION",
            difficulty: "EASY",
            mandatory: true,
          },
        ],
      },
      blankSection("Role knowledge"),
    ],
  };
}

/** Client-side checks shown in the review step (the server validates again). */
export function reviewIssues(
  doc: BuilderDocument,
  skills: BuilderSkill[],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const questions = doc.sections.flatMap((s) => s.questions);
  if (questions.length === 0) errors.push("Add at least one question.");
  if (questions.some((q) => q.text.trim().length === 0)) errors.push("Some questions are empty.");
  if (doc.sections.some((s) => s.name.trim() === "")) errors.push("Every section needs a name.");
  if (doc.minQuestions > doc.maxQuestions)
    errors.push("Minimum questions can't exceed the maximum.");
  const sectionMinutes = doc.sections.reduce((sum, s) => sum + s.targetDurationMinutes, 0);
  if (Math.abs(sectionMinutes - doc.durationMinutes) > 3)
    warnings.push(
      `Section durations add up to ${sectionMinutes} min, but the interview is ${doc.durationMinutes} min.`,
    );
  const covered = new Set(
    [...questions.map((q) => q.skillId), ...doc.sections.flatMap((s) => s.focusSkillIds)].filter(
      Boolean,
    ),
  );
  const uncovered = skills.filter((s) => !covered.has(s.id));
  if (uncovered.length > 0)
    warnings.push(
      `No questions cover: ${uncovered.map((s) => s.name).join(", ")}. Dynamic questions may cover them if enabled.`,
    );
  if (!questions.some((q) => q.mandatory))
    warnings.push("No mandatory questions — every candidate may get a different path.");
  return { errors, warnings };
}
