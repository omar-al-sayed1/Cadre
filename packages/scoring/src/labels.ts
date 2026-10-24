import type { Recommendation } from "@repo/shared";

export interface RecommendationMeta {
  label: string;
  /** Semantic tone used for accessible, non-colour-only badges. */
  tone: "positive" | "positive-strong" | "neutral" | "negative" | "muted";
  icon: "double-check" | "check" | "minus" | "x" | "help";
  description: string;
}

export const RECOMMENDATION_META: Record<Recommendation, RecommendationMeta> = {
  STRONG_MOVE_FORWARD: {
    label: "Strong move forward",
    tone: "positive-strong",
    icon: "double-check",
    description: "Evidence strongly supports advancing to the next stage.",
  },
  MOVE_FORWARD: {
    label: "Move forward",
    tone: "positive",
    icon: "check",
    description: "Evidence supports advancing to the next stage.",
  },
  BORDERLINE: {
    label: "Borderline",
    tone: "neutral",
    icon: "minus",
    description: "Mixed evidence; consider a targeted follow-up.",
  },
  DO_NOT_MOVE_FORWARD: {
    label: "Do not move forward",
    tone: "negative",
    icon: "x",
    description: "Evidence does not currently support advancing.",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient evidence",
    tone: "muted",
    icon: "help",
    description: "Not enough evidence to make a recommendation.",
  },
};
