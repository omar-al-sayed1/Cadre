/**
 * Evidence-based confidence (spec §37).
 *
 * The model reports a confidence per skill, but a score backed by one short
 * answer must never look as reliable as one backed by several. We combine the
 * model's estimate with a deterministic evidence-count ceiling and take the
 * more conservative of the two.
 */
export function evidenceCeiling(evidenceCount: number): number {
  if (evidenceCount <= 0) return 0.1;
  if (evidenceCount === 1) return 0.45;
  if (evidenceCount === 2) return 0.65;
  if (evidenceCount === 3) return 0.8;
  return 0.92;
}

export function combineConfidence(modelConfidence: number, evidenceCount: number): number {
  const model = Number.isFinite(modelConfidence) ? Math.max(0, Math.min(1, modelConfidence)) : 0;
  return Math.round(Math.min(model, evidenceCeiling(evidenceCount)) * 100) / 100;
}

/** Weighted mean of confidences (weights ≥ 0). */
export function weightedConfidence(items: Array<{ confidence: number; weight: number }>): number {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total === 0) return 0;
  const value = items.reduce((sum, i) => sum + i.confidence * Math.max(0, i.weight), 0) / total;
  return Math.round(value * 100) / 100;
}
