import type { Recommendation } from "@repo/shared";
import { combineConfidence, weightedConfidence } from "./confidence";
import { clampScore } from "./scale";

/**
 * Deterministic rubric aggregation (spec §35). The model provides per-skill and
 * per-competency scores with evidence; the overall score and recommendation are
 * computed here, transparently, from the configured weights — never taken as an
 * opaque number from the model.
 */

export type CategoryKey =
  "technical" | "communication" | "problemSolving" | "experience" | "behavioral";
export const CATEGORY_KEYS: CategoryKey[] = [
  "technical",
  "communication",
  "problemSolving",
  "experience",
  "behavioral",
];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  technical: "Technical skills",
  communication: "Communication",
  problemSolving: "Problem solving",
  experience: "Relevant experience",
  behavioral: "Behavioral competencies",
};

export type CategoryWeights = Record<CategoryKey, number>;

export interface SkillScoreInput {
  key: string;
  weight: number;
  critical: boolean;
  score: number | null;
  confidence: number;
  evidenceCount: number;
}

export interface CompetencyInput {
  score: number | null;
  confidence: number;
  evidenceCount: number;
}

export interface AggregateInput {
  categoryWeights: CategoryWeights;
  skills: SkillScoreInput[];
  competencies: Record<Exclude<CategoryKey, "technical">, CompetencyInput>;
}

export interface CategoryResult {
  score: number | null;
  confidence: number;
  /** Configured weight (0–100). */
  weight: number;
  /** Weight after redistributing categories without evidence (0–100). */
  effectiveWeight: number;
}

export interface AggregateResult {
  overallScore: number | null;
  overallConfidence: number;
  categories: Record<CategoryKey, CategoryResult>;
  /** Share of technical (skill) weight backed by evidence, 0–1. */
  technicalCoverage: number;
  /** Skills normalised with evidence-adjusted confidence. */
  skills: Array<SkillScoreInput & { adjustedConfidence: number }>;
  criticalGaps: string[];
}

export function aggregateScores(input: AggregateInput): AggregateResult {
  const skills = input.skills.map((s) => ({
    ...s,
    score: s.score === null ? null : clampScore(s.score),
    adjustedConfidence: s.score === null ? 0 : combineConfidence(s.confidence, s.evidenceCount),
  }));

  const totalSkillWeight = skills.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  const evidenced = skills.filter((s) => s.score !== null);
  const evidencedWeight = evidenced.reduce((sum, s) => sum + Math.max(0, s.weight), 0);

  const technicalScore =
    evidenced.length === 0
      ? null
      : evidencedWeight > 0
        ? clampScore(
            evidenced.reduce((sum, s) => sum + (s.score as number) * Math.max(0, s.weight), 0) /
              evidencedWeight,
          )
        : clampScore(evidenced.reduce((sum, s) => sum + (s.score as number), 0) / evidenced.length);

  const technicalCoverage =
    totalSkillWeight > 0 ? evidencedWeight / totalSkillWeight : evidenced.length > 0 ? 1 : 0;
  // Missing skills count as zero confidence, so thin coverage lowers technical confidence.
  const technicalConfidence = weightedConfidence(
    skills.map((s) => ({
      confidence: s.adjustedConfidence,
      weight: totalSkillWeight > 0 ? s.weight : 1,
    })),
  );

  const raw: Record<CategoryKey, { score: number | null; confidence: number }> = {
    technical: { score: technicalScore, confidence: technicalConfidence },
    communication: competency(input.competencies.communication),
    problemSolving: competency(input.competencies.problemSolving),
    experience: competency(input.competencies.experience),
    behavioral: competency(input.competencies.behavioral),
  };

  const available = CATEGORY_KEYS.filter(
    (k) => raw[k].score !== null && input.categoryWeights[k] > 0,
  );
  const availableWeight = available.reduce((sum, k) => sum + input.categoryWeights[k], 0);
  const totalWeight =
    CATEGORY_KEYS.reduce((sum, k) => sum + Math.max(0, input.categoryWeights[k]), 0) || 1;

  const categories = Object.fromEntries(
    CATEGORY_KEYS.map((k) => [
      k,
      {
        score: raw[k].score,
        confidence: raw[k].confidence,
        weight: input.categoryWeights[k],
        effectiveWeight:
          available.includes(k) && availableWeight > 0
            ? Math.round((input.categoryWeights[k] / availableWeight) * 100 * 10) / 10
            : 0,
      },
    ]),
  ) as Record<CategoryKey, CategoryResult>;

  const overallScore =
    available.length === 0
      ? null
      : clampScore(
          available.reduce(
            (sum, k) => sum + (raw[k].score as number) * input.categoryWeights[k],
            0,
          ) / availableWeight,
        );

  const overallConfidence =
    Math.round(
      (CATEGORY_KEYS.reduce(
        (sum, k) => sum + raw[k].confidence * Math.max(0, input.categoryWeights[k]),
        0,
      ) /
        totalWeight) *
        100,
    ) / 100;

  const criticalGaps = skills
    .filter((s) => s.critical && (s.score === null || s.score < 41))
    .map((s) => s.key);

  return { overallScore, overallConfidence, categories, technicalCoverage, skills, criticalGaps };
}

function competency(c: CompetencyInput): { score: number | null; confidence: number } {
  if (c.score === null) return { score: null, confidence: 0 };
  return {
    score: clampScore(c.score),
    confidence: combineConfidence(c.confidence, c.evidenceCount),
  };
}

// ───────────────────────── Recommendation ─────────────────────────

export const RECOMMENDATION_ORDER: Recommendation[] = [
  "DO_NOT_MOVE_FORWARD",
  "BORDERLINE",
  "MOVE_FORWARD",
  "STRONG_MOVE_FORWARD",
];

export const THRESHOLDS = { strong: 82, move: 68, borderline: 52 } as const;

export interface RecommendationResult {
  recommendation: Recommendation;
  confidence: number;
  reasons: string[];
}

/**
 * Deterministic recommendation from aggregated scores. The model's own
 * suggestion is only used to *downgrade* to INSUFFICIENT_EVIDENCE when the
 * model also judged the evidence thin — it can never upgrade a candidate.
 */
export function deriveRecommendation(
  aggregate: AggregateResult,
  modelSuggestion?: { recommendation: Recommendation; confidence: number } | null,
): RecommendationResult {
  const reasons: string[] = [];
  const { overallScore, overallConfidence, technicalCoverage, categories } = aggregate;

  const hasTechnical = categories.technical.weight > 0 && aggregate.skills.length > 0;
  if (overallScore === null) {
    return {
      recommendation: "INSUFFICIENT_EVIDENCE",
      confidence: 0.2,
      reasons: ["No scored evidence was collected."],
    };
  }
  if (overallConfidence < 0.3) {
    return {
      recommendation: "INSUFFICIENT_EVIDENCE",
      confidence: 0.3,
      reasons: ["Overall evidence confidence is too low for a recommendation."],
    };
  }
  if (hasTechnical && technicalCoverage < 0.4) {
    return {
      recommendation: "INSUFFICIENT_EVIDENCE",
      confidence: 0.35,
      reasons: ["Less than 40% of the weighted skills were assessed."],
    };
  }
  if (modelSuggestion?.recommendation === "INSUFFICIENT_EVIDENCE" && overallConfidence < 0.5) {
    return {
      recommendation: "INSUFFICIENT_EVIDENCE",
      confidence: 0.35,
      reasons: ["The evaluator judged the interview evidence insufficient."],
    };
  }

  let recommendation: Recommendation =
    overallScore >= THRESHOLDS.strong
      ? "STRONG_MOVE_FORWARD"
      : overallScore >= THRESHOLDS.move
        ? "MOVE_FORWARD"
        : overallScore >= THRESHOLDS.borderline
          ? "BORDERLINE"
          : "DO_NOT_MOVE_FORWARD";
  reasons.push(`Weighted overall score ${overallScore}.`);

  if (recommendation === "STRONG_MOVE_FORWARD" && overallConfidence < 0.6) {
    recommendation = "MOVE_FORWARD";
    reasons.push("Downgraded from strong because evidence confidence is moderate.");
  }

  const evidencedCriticalGaps = aggregate.skills.filter(
    (s) => s.critical && s.score !== null && s.score < 41,
  );
  if (evidencedCriticalGaps.length > 0 && rank(recommendation) > rank("BORDERLINE")) {
    recommendation = "BORDERLINE";
    reasons.push(`Critical skill gap: ${evidencedCriticalGaps.map((s) => s.key).join(", ")}.`);
  }

  // Confidence: start from evidence confidence; reduce near decision thresholds.
  const nearest = Math.min(...Object.values(THRESHOLDS).map((t) => Math.abs(overallScore - t)));
  let confidence = overallConfidence * (nearest < 3 ? 0.85 : 1);
  if (modelSuggestion) {
    const disagreement = Math.abs(rank(modelSuggestion.recommendation) - rank(recommendation));
    if (modelSuggestion.recommendation !== "INSUFFICIENT_EVIDENCE" && disagreement >= 2) {
      confidence *= 0.8;
      reasons.push("The evaluator's narrative recommendation differs; review evidence closely.");
    }
  }
  return {
    recommendation,
    confidence: Math.round(Math.max(0.05, Math.min(0.95, confidence)) * 100) / 100,
    reasons,
  };
}

function rank(r: Recommendation): number {
  const index = RECOMMENDATION_ORDER.indexOf(r);
  return index === -1 ? -1 : index;
}
