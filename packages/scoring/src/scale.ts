import type { ConfidenceLevel, ExperienceLevel } from "@repo/shared";

/** Scoring rubric version — recorded on every evaluation so historical reports stay reproducible. */
export const SCORING_VERSION = "scoring_v1";

export interface ScoreBand {
  min: number;
  max: number;
  label: string;
  description: string;
}

/** The single score scale used everywhere (spec §36). */
export const SCORE_BANDS: ScoreBand[] = [
  {
    min: 0,
    max: 20,
    label: "No demonstrated knowledge",
    description: "No relevant knowledge was demonstrated.",
  },
  {
    min: 21,
    max: 40,
    label: "Limited",
    description: "Fragmentary or mostly incorrect understanding.",
  },
  {
    min: 41,
    max: 60,
    label: "Basic",
    description: "Foundational understanding, typical of junior level.",
  },
  { min: 61, max: 75, label: "Competent", description: "Solid working knowledge with minor gaps." },
  { min: 76, max: 90, label: "Strong", description: "Thorough, accurate and well-reasoned." },
  { min: 91, max: 100, label: "Exceptional", description: "Expert depth with nuanced trade-offs." },
];

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreBand(score: number): ScoreBand {
  const s = clampScore(score);
  return SCORE_BANDS.find((band) => s >= band.min && s <= band.max) ?? SCORE_BANDS[0]!;
}

/**
 * Scores are already relative to the role's expected level (the evaluator is
 * instructed so). This expresses that bar in absolute terms for display:
 * e.g. a "competent" junior answer is not the same evidence as a "competent" senior one.
 */
export const EXPECTED_BAR_BY_LEVEL: Record<ExperienceLevel, string> = {
  INTERN: "fundamentals and willingness to learn",
  JUNIOR: "solid fundamentals and guided delivery",
  MID: "independent delivery and sound design choices",
  SENIOR: "depth, trade-off reasoning and technical leadership",
  LEAD: "architecture, mentoring and cross-team impact",
  PRINCIPAL: "organisation-wide technical direction",
};

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.7) return "HIGH";
  if (confidence >= 0.45) return "MEDIUM";
  return "LOW";
}
