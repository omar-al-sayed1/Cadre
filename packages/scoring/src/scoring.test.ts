import { describe, expect, it } from "vitest";
import { aggregateScores, deriveRecommendation, type AggregateInput } from "./aggregate";
import { combineConfidence, evidenceCeiling } from "./confidence";
import { confidenceLevel, scoreBand } from "./scale";

const weights = {
  technical: 50,
  communication: 15,
  problemSolving: 15,
  experience: 10,
  behavioral: 10,
};
const competency = (score: number | null, confidence = 0.7, evidenceCount = 3) => ({
  score,
  confidence,
  evidenceCount,
});

function input(overrides: Partial<AggregateInput> = {}): AggregateInput {
  return {
    categoryWeights: weights,
    skills: [
      { key: "java", weight: 30, critical: true, score: 85, confidence: 0.85, evidenceCount: 3 },
      { key: "spring", weight: 30, critical: true, score: 80, confidence: 0.8, evidenceCount: 3 },
      { key: "sql", weight: 20, critical: false, score: 70, confidence: 0.6, evidenceCount: 2 },
      { key: "git", weight: 20, critical: false, score: 75, confidence: 0.5, evidenceCount: 1 },
    ],
    competencies: {
      communication: competency(80),
      problemSolving: competency(78),
      experience: competency(70),
      behavioral: competency(72),
    },
    ...overrides,
  };
}

describe("score scale", () => {
  it("maps scores to the shared bands", () => {
    expect(scoreBand(10).label).toBe("No demonstrated knowledge");
    expect(scoreBand(55).label).toBe("Basic");
    expect(scoreBand(82).label).toBe("Strong");
    expect(scoreBand(100).label).toBe("Exceptional");
  });
  it("maps confidence to levels", () => {
    expect(confidenceLevel(0.9)).toBe("HIGH");
    expect(confidenceLevel(0.5)).toBe("MEDIUM");
    expect(confidenceLevel(0.2)).toBe("LOW");
  });
});

describe("confidence", () => {
  it("caps model confidence by evidence count", () => {
    expect(evidenceCeiling(1)).toBeLessThan(evidenceCeiling(3));
    expect(combineConfidence(0.95, 1)).toBe(0.45);
    expect(combineConfidence(0.5, 4)).toBe(0.5);
    expect(combineConfidence(0.9, 0)).toBe(0.1);
  });
});

describe("aggregateScores", () => {
  it("computes a weighted overall score from categories", () => {
    const result = aggregateScores(input());
    // technical = (85*30 + 80*30 + 70*20 + 75*20) / 100 = 78.5 → 79
    expect(result.categories.technical.score).toBe(79);
    expect(result.overallScore).toBeGreaterThan(70);
    expect(result.overallScore).toBeLessThan(85);
    expect(result.technicalCoverage).toBe(1);
  });

  it("redistributes weight when a category has no evidence and lowers confidence", () => {
    const full = aggregateScores(input());
    const partial = aggregateScores(
      input({ competencies: { ...input().competencies, behavioral: competency(null) } }),
    );
    expect(partial.categories.behavioral.effectiveWeight).toBe(0);
    expect(partial.overallScore).not.toBeNull();
    expect(partial.overallConfidence).toBeLessThan(full.overallConfidence);
  });

  it("reports single-answer skills with low confidence (spec §37)", () => {
    const result = aggregateScores(input());
    const git = result.skills.find((s) => s.key === "git")!;
    expect(git.adjustedConfidence).toBeLessThanOrEqual(0.45);
  });
});

describe("deriveRecommendation", () => {
  it("recommends moving forward for a solid, well-evidenced interview", () => {
    expect(["MOVE_FORWARD", "STRONG_MOVE_FORWARD"]).toContain(
      deriveRecommendation(aggregateScores(input())).recommendation,
    );
  });

  it("returns insufficient evidence when most skills are unassessed", () => {
    const thin = input({
      skills: input().skills.map((s, i) =>
        i === 0 ? s : { ...s, score: null, confidence: 0, evidenceCount: 0 },
      ),
    });
    expect(deriveRecommendation(aggregateScores(thin)).recommendation).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
  });

  it("caps at borderline when a critical skill is clearly weak", () => {
    const gap = input({
      skills: input().skills.map((s) =>
        s.key === "java" ? { ...s, score: 30 } : { ...s, score: 95 },
      ),
    });
    const result = deriveRecommendation(aggregateScores(gap));
    expect(result.recommendation).toBe("BORDERLINE");
    expect(result.reasons.join(" ")).toContain("Critical skill gap");
  });

  it("does not move forward on weak evidence", () => {
    const weak = input({
      skills: input().skills.map((s) => ({ ...s, score: 30 })),
      competencies: {
        communication: competency(40),
        problemSolving: competency(30),
        experience: competency(35),
        behavioral: competency(40),
      },
    });
    expect(deriveRecommendation(aggregateScores(weak)).recommendation).toBe("DO_NOT_MOVE_FORWARD");
  });

  it("never lets the model's suggestion upgrade the recommendation", () => {
    const weak = input({ skills: input().skills.map((s) => ({ ...s, score: 40 })) });
    const result = deriveRecommendation(aggregateScores(weak), {
      recommendation: "STRONG_MOVE_FORWARD",
      confidence: 0.9,
    });
    expect(result.recommendation).not.toBe("STRONG_MOVE_FORWARD");
  });
});
