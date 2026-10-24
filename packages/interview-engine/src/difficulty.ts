import type { QuestionDifficulty, SkillLevel } from "@repo/shared";
import type { TemplateSnapshot } from "./snapshot";

/**
 * Adaptive difficulty (spec §29).
 * EASY → MEDIUM → HARD when answers are strong; step down when the candidate struggles.
 */
const LADDER: QuestionDifficulty[] = ["EASY", "MEDIUM", "HARD"];

export const STEP_UP_SCORE = 75;
export const STEP_DOWN_SCORE = 45;

export function isAdaptive(snapshot: TemplateSnapshot): boolean {
  return snapshot.difficulty === "ADAPTIVE" && snapshot.aiSettings.adaptiveDifficulty;
}

export function initialDifficulty(
  snapshot: TemplateSnapshot,
  expectedLevel: SkillLevel,
): QuestionDifficulty {
  if (snapshot.difficulty !== "ADAPTIVE") return snapshot.difficulty;
  if (!snapshot.aiSettings.adaptiveDifficulty) return "MEDIUM";
  return expectedLevel === "ADVANCED" || expectedLevel === "EXPERT" ? "MEDIUM" : "EASY";
}

export function nextDifficulty(
  current: QuestionDifficulty,
  score: number | null,
): QuestionDifficulty {
  if (score === null) return current;
  const index = LADDER.indexOf(current);
  if (score >= STEP_UP_SCORE) return LADDER[Math.min(LADDER.length - 1, index + 1)]!;
  if (score <= STEP_DOWN_SCORE) return LADDER[Math.max(0, index - 1)]!;
  return current;
}

/** Distance between difficulties, used to pick the closest available bank question. */
export function difficultyDistance(a: QuestionDifficulty, b: QuestionDifficulty): number {
  return Math.abs(LADDER.indexOf(a) - LADDER.indexOf(b));
}
