import { z } from "zod";
import { LIMITS } from "@repo/config";
import { QUESTION_DIFFICULTIES, QUESTION_TYPES } from "@repo/shared";
import { evidenceCeiling } from "@repo/scoring";
import type { AnswerEvaluation } from "@repo/ai";
import { initialDifficulty } from "./difficulty";
import { orderedSections, type TemplateSnapshot } from "./snapshot";

/**
 * Working interview memory (spec §34, §66). Persisted as InterviewSession.engineState
 * after every turn. It keeps the context the interviewer needs without resending an
 * unbounded transcript: recent turns verbatim, older turns as compact digests,
 * candidate facts, per-skill evidence and question history.
 */

const difficulty = z.enum(QUESTION_DIFFICULTIES);

export const currentQuestionSchema = z.object({
  threadKey: z.string(),
  questionKey: z.string().nullable(),
  primaryText: z.string(),
  text: z.string(),
  type: z.enum(QUESTION_TYPES),
  skillKey: z.string().nullable(),
  sectionKey: z.string().nullable(),
  difficulty,
  expectedTopics: z.array(z.string()),
  redFlags: z.array(z.string()),
  followUpGuidance: z.string().nullable(),
  isFollowUp: z.boolean(),
  followUpDepth: z.number().int().min(0),
  askedAtSeconds: z.number(),
});
export type CurrentQuestion = z.infer<typeof currentQuestionSchema>;

export const skillEvidenceSchema = z.object({
  evidence: z.array(
    z.object({
      answerId: z.string(),
      threadKey: z.string(),
      score: z.number().nullable(),
      confidence: z.number(),
      summary: z.string(),
    }),
  ),
  coverage: z.number(),
  confidence: z.number(),
  lastScore: z.number().nullable(),
  targetDifficulty: difficulty,
});
export type SkillEvidence = z.infer<typeof skillEvidenceSchema>;

export const engineMemorySchema = z.object({
  version: z.literal(1),
  phase: z.enum(["NOT_STARTED", "GREETING", "QUESTIONING", "CLOSING", "ENDED"]),
  sectionIndex: z.number().int().min(0),
  sections: z.array(
    z.object({
      key: z.string(),
      questionsAsked: z.number().int().min(0),
      startedAtSeconds: z.number().nullable(),
      completed: z.boolean(),
    }),
  ),
  current: currentQuestionSchema.nullable(),
  askedQuestionKeys: z.array(z.string()),
  askedQuestionTexts: z.array(z.string()),
  primaryQuestionsAsked: z.number().int().min(0),
  followUpsAsked: z.number().int().min(0),
  skills: z.record(z.string(), skillEvidenceSchema),
  candidateFacts: z.array(z.string()),
  digests: z.array(z.object({ turn: z.number().int(), text: z.string() })),
  recentTurns: z.array(
    z.object({ turn: z.number().int(), role: z.enum(["AI", "CANDIDATE"]), text: z.string() }),
  ),
  turnCount: z.number().int().min(0),
  consecutiveAiFailures: z.number().int().min(0),
  clarificationsForCurrent: z.number().int().min(0),
  consecutiveUnclear: z.number().int().min(0),
  closingAsked: z.boolean(),
  resumeHooksUsed: z.array(z.string()),
  stats: z.object({
    dontKnowCount: z.number().int().min(0),
    injectionAttempts: z.number().int().min(0),
    fallbackResponses: z.number().int().min(0),
  }),
});
export type EngineMemory = z.infer<typeof engineMemorySchema>;

export function createInitialMemory(snapshot: TemplateSnapshot): EngineMemory {
  const skills: EngineMemory["skills"] = {};
  for (const skill of snapshot.skills) {
    skills[skill.key] = {
      evidence: [],
      coverage: 0,
      confidence: 0,
      lastScore: null,
      targetDifficulty: initialDifficulty(snapshot, skill.expectedLevel),
    };
  }
  return {
    version: 1,
    phase: "NOT_STARTED",
    sectionIndex: 0,
    sections: orderedSections(snapshot).map((s) => ({
      key: s.key,
      questionsAsked: 0,
      startedAtSeconds: null,
      completed: false,
    })),
    current: null,
    askedQuestionKeys: [],
    askedQuestionTexts: [],
    primaryQuestionsAsked: 0,
    followUpsAsked: 0,
    skills,
    candidateFacts: [],
    digests: [],
    recentTurns: [],
    turnCount: 0,
    consecutiveAiFailures: 0,
    clarificationsForCurrent: 0,
    consecutiveUnclear: 0,
    closingAsked: false,
    resumeHooksUsed: [],
    stats: { dontKnowCount: 0, injectionAttempts: 0, fallbackResponses: 0 },
  };
}

/** Parse persisted memory; returns a fresh memory if the stored value is missing or corrupt. */
export function loadMemory(value: unknown, snapshot: TemplateSnapshot): EngineMemory {
  const parsed = engineMemorySchema.safeParse(value);
  return parsed.success ? parsed.data : createInitialMemory(snapshot);
}

export function cloneMemory(memory: EngineMemory): EngineMemory {
  return structuredClone(memory);
}

export function appendTurn(memory: EngineMemory, role: "AI" | "CANDIDATE", text: string): void {
  memory.turnCount += 1;
  memory.recentTurns.push({ turn: memory.turnCount, role, text });
  const max = LIMITS.memory.recentTurns;
  if (memory.recentTurns.length > max)
    memory.recentTurns.splice(0, memory.recentTurns.length - max);
}

export function addDigest(memory: EngineMemory, text: string): void {
  memory.digests.push({ turn: memory.turnCount, text });
  if (memory.digests.length > 60) memory.digests.splice(0, memory.digests.length - 60);
}

/** Digests of turns no longer present verbatim in the recent window (the rolling summary). */
export function summaryLines(memory: EngineMemory): string[] {
  const oldestRecent = memory.recentTurns[0]?.turn ?? Number.POSITIVE_INFINITY;
  return memory.digests
    .filter((d) => d.turn < oldestRecent)
    .map((d) => d.text)
    .slice(-20);
}

export function mergeFacts(memory: EngineMemory, facts: string[]): void {
  const existing = new Set(memory.candidateFacts.map((f) => f.toLowerCase()));
  for (const fact of facts) {
    const trimmed = fact.trim();
    if (trimmed.length < 3 || existing.has(trimmed.toLowerCase())) continue;
    memory.candidateFacts.push(trimmed.slice(0, 300));
    existing.add(trimmed.toLowerCase());
  }
  const max = LIMITS.memory.maxCandidateFacts;
  if (memory.candidateFacts.length > max)
    memory.candidateFacts.splice(0, memory.candidateFacts.length - max);
}

/** Record interim evidence for a skill and recompute coverage/confidence. */
export function recordSkillEvidence(
  memory: EngineMemory,
  skillKey: string,
  entry: { answerId: string; threadKey: string; evaluation: AnswerEvaluation },
): SkillEvidence | null {
  const skill = memory.skills[skillKey];
  if (!skill) return null;
  skill.evidence.push({
    answerId: entry.answerId,
    threadKey: entry.threadKey,
    score: entry.evaluation.score,
    confidence: entry.evaluation.confidence,
    summary: entry.evaluation.answerSummary.slice(0, 300),
  });
  const max = LIMITS.memory.maxEvidencePerSkill;
  if (skill.evidence.length > max) skill.evidence.splice(0, skill.evidence.length - max);

  const scored = skill.evidence.filter((e) => e.score !== null);
  const totalConfidence = skill.evidence.reduce((sum, e) => sum + e.confidence, 0);
  // ~2 solid answers (confidence ≈ 0.8) give full coverage of a skill.
  skill.coverage = Math.round(Math.min(1, totalConfidence / 1.6) * 100) / 100;
  const meanConfidence = skill.evidence.length > 0 ? totalConfidence / skill.evidence.length : 0;
  skill.confidence =
    Math.round(Math.min(meanConfidence, evidenceCeiling(scored.length)) * 100) / 100;
  skill.lastScore = entry.evaluation.score ?? skill.lastScore;
  return skill;
}
