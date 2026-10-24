import type { LeadStatus } from "@repo/shared";
import type {
  CompanySizeBand,
  QualificationRule,
  QualificationStrictness,
  SalesAgentConfig,
  ScoreFactor,
} from "@repo/validation";
import { COMPANY_SIZE_BANDS, SCORE_FACTORS } from "@repo/validation";
import { normalizeText } from "./normalize";

/**
 * Deterministic lead scoring (spec §11). Every factor scores 0–100 with a
 * human-readable reason and a state:
 *
 *   scored          data available → contributes its score
 *   unknown         relevant, but the lead record lacks the data
 *   not_applicable  not configured (e.g. no target industries) or not yet
 *                   possible (no contact yet → no engagement / intent)
 *
 * The score is the weighted average of scored factors, shrunk toward a
 * neutral prior by how much relevant data is missing — so a lead is never
 * "hot" just because we know almost nothing about it, and missing data is
 * never guessed. `confidence` is the share of relevant weight backed by data.
 * Same lead + same configuration ⇒ same score.
 */
export const SCORING_VERSION = "lead_scoring_v1";

/** Score assumed for relevant-but-unknown data (slightly below "medium"). */
export const UNKNOWN_PRIOR = 40;

export interface ScorableLead {
  companyName?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  industry?: string | null;
  companySize?: string | null;
  status: LeadStatus;
  intentScore?: number | null;
}

/** Optional evidence from research / conversation analysis (later phases). */
export interface ScoreSignals {
  /** 0–100: how relevant the prospect's problems are to the offering. */
  problemRelevance?: number | null;
}

export type FactorState = "scored" | "unknown" | "not_applicable";

export interface FactorResult {
  key: ScoreFactor;
  label: string;
  weight: number;
  state: FactorState;
  /** null unless state === "scored". */
  score: number | null;
  reason: string;
}

type FactorOutcome = Omit<FactorResult, "key" | "label" | "weight">;

const scored = (score: number, reason: string): FactorOutcome => ({
  state: "scored",
  score,
  reason,
});
const unknown = (reason: string): FactorOutcome => ({ state: "unknown", score: null, reason });
const notApplicable = (reason: string): FactorOutcome => ({
  state: "not_applicable",
  score: null,
  reason,
});

export type ScoreBand = "hot" | "high" | "medium" | "low" | "very_low";

export interface QualificationVerdict {
  status: "QUALIFIED" | "UNQUALIFIED" | "NEEDS_REVIEW";
  met: string[];
  failed: string[];
  unknown: string[];
  reason: string;
}

export interface LeadScoreResult {
  version: string;
  leadScore: number;
  qualificationScore: number | null;
  band: ScoreBand;
  /** 0–1: share of configured weight backed by data. */
  confidence: number;
  factors: FactorResult[];
  qualification: QualificationVerdict;
}

export const FACTOR_LABELS: Record<ScoreFactor, string> = {
  industryFit: "Industry fit",
  locationFit: "Location fit",
  roleRelevance: "Role relevance",
  companySizeFit: "Company size",
  qualificationFit: "Qualification rules",
  problemRelevance: "Problem relevance",
  intent: "Buying intent",
  engagement: "Engagement",
};

export const BAND_LABELS: Record<ScoreBand, string> = {
  hot: "Hot",
  high: "High",
  medium: "Medium",
  low: "Low",
  very_low: "Very low",
};

/** Factors describing fit with the ideal customer profile (→ qualificationScore). */
const FIT_FACTORS: readonly ScoreFactor[] = [
  "industryFit",
  "locationFit",
  "roleRelevance",
  "companySizeFit",
  "qualificationFit",
];

/** Factors where a clear miss blocks automatic qualification. */
const HARD_MISMATCH_FACTORS: readonly ScoreFactor[] = [
  "industryFit",
  "locationFit",
  "companySizeFit",
];

const DECISION_MAKER =
  /\b(owner|founder|co ?founder|ceo|chief|president|managing director|general manager|gm|director|head|vp|vice president|partner|principal|proprietor)\b/;

const STOP = new Set(["and", "of", "the", "for", "in", "&", "services", "company"]);

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** True when two short phrases clearly refer to the same thing. */
export function phraseMatches(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = tokens(a).map(stem);
  const tb = new Set(tokens(b).map(stem));
  return ta.some((t) => t.length > 2 && tb.has(t));
}

function stem(word: string): string {
  return word.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
}

// ─────────────────────────── company size ───────────────────────────

const BAND_RANGES: Record<CompanySizeBand, [number, number]> = {
  "1-10": [1, 10],
  "11-50": [11, 50],
  "51-200": [51, 200],
  "201-1000": [201, 1000],
  "1000+": [1001, Number.POSITIVE_INFINITY],
};

/** Parse "12", "11-50", "50+", "about 200 employees" → representative headcount. */
export function parseEmployeeCount(value: string | null | undefined): number | null {
  if (!value) return null;
  const numbers = [...value.replace(/,/g, "").matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (numbers.length === 0) return null;
  if (numbers.length >= 2) return Math.round((numbers[0]! + numbers[1]!) / 2);
  return numbers[0]!;
}

export function sizeBandFor(count: number): CompanySizeBand {
  return (
    COMPANY_SIZE_BANDS.find(
      (band) => count >= BAND_RANGES[band][0] && count <= BAND_RANGES[band][1],
    ) ?? "1000+"
  );
}

// ─────────────────────────── qualification rules ───────────────────────────

type RuleOutcome = "met" | "failed" | "unknown";

function fieldValue(lead: ScorableLead, field: QualificationRule["field"]): string | null {
  const value = lead[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function evaluateRule(lead: ScorableLead, rule: QualificationRule): RuleOutcome {
  const value = fieldValue(lead, rule.field);
  switch (rule.operator) {
    case "isPresent":
      return value ? "met" : "failed";
    case "equals":
      if (!value) return "unknown";
      return normalizeText(value) === normalizeText(rule.value) ? "met" : "failed";
    case "contains":
      if (!value) return "unknown";
      return phraseMatches(value, rule.value) ? "met" : "failed";
    case "oneOf": {
      if (!value) return "unknown";
      const options = rule.value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      return options.some((o) => phraseMatches(value, o)) ? "met" : "failed";
    }
    case "minEmployees": {
      const count = parseEmployeeCount(value);
      const min = Number(rule.value);
      if (count === null || !Number.isFinite(min)) return "unknown";
      return count >= min ? "met" : "failed";
    }
  }
}

const STRICTNESS_THRESHOLD: Record<QualificationStrictness, number> = {
  LENIENT: 50,
  BALANCED: 60,
  STRICT: 75,
};

// ─────────────────────────── factors ───────────────────────────

function industryFit(lead: ScorableLead, config: SalesAgentConfig): FactorOutcome {
  const targets = config.icp.industries;
  if (targets.length === 0) return notApplicable("No target industries configured.");
  if (!lead.industry) return unknown("Industry unknown.");
  const match = targets.find((t) => phraseMatches(lead.industry!, t));
  return match
    ? scored(100, `${lead.industry} matches target industry “${match}”.`)
    : scored(15, `${lead.industry} is outside your target industries.`);
}

function locationFit(lead: ScorableLead, config: SalesAgentConfig): FactorOutcome {
  const { countries, cities } = config.icp;
  if (countries.length === 0 && cities.length === 0)
    return notApplicable("No target locations configured.");
  const place = [lead.city, lead.country, lead.location].filter(Boolean).join(", ");
  if (!place) return unknown("Location unknown.");
  const countryKnown = Boolean(lead.country || lead.location);
  const countryMatch =
    countries.length > 0 &&
    countries.some((c) => phraseMatches(lead.country ?? lead.location ?? "", c));
  const cityMatch =
    cities.length > 0 && cities.some((c) => phraseMatches(lead.city ?? lead.location ?? "", c));
  if (cities.length > 0 && cityMatch) return scored(100, `${place} is in a target city.`);
  if (countryMatch) {
    return cities.length > 0
      ? scored(75, `${place} is in a target country, outside the target cities.`)
      : scored(100, `${place} is in a target country.`);
  }
  if (countries.length > 0 && countryKnown)
    return scored(10, `${place} is outside your target countries.`);
  return scored(30, `${place} doesn't match your target cities.`);
}

function roleRelevance(lead: ScorableLead, config: SalesAgentConfig): FactorOutcome {
  if (!lead.jobTitle) return unknown("Job title unknown.");
  const targets = config.icp.jobTitles;
  const match = targets.find((t) => phraseMatches(lead.jobTitle!, t));
  if (match) return scored(100, `${lead.jobTitle} matches target role “${match}”.`);
  const decisionMaker = DECISION_MAKER.test(normalizeText(lead.jobTitle));
  if (targets.length === 0) {
    return decisionMaker
      ? scored(75, `${lead.jobTitle} is likely a decision maker.`)
      : scored(40, `${lead.jobTitle} may not be a decision maker.`);
  }
  return decisionMaker
    ? scored(65, `${lead.jobTitle} isn't a target role but is likely a decision maker.`)
    : scored(25, `${lead.jobTitle} isn't one of your target roles.`);
}

function companySizeFit(lead: ScorableLead, config: SalesAgentConfig): FactorOutcome {
  const targets = config.icp.companySizes;
  if (targets.length === 0) return notApplicable("No target company sizes configured.");
  const count = parseEmployeeCount(lead.companySize);
  if (count === null) return unknown("Company size unknown.");
  const band = sizeBandFor(count);
  if (targets.includes(band)) return scored(100, `${band} employees is a target size.`);
  const index = COMPANY_SIZE_BANDS.indexOf(band);
  const adjacent = targets.some((t) => Math.abs(COMPANY_SIZE_BANDS.indexOf(t) - index) === 1);
  return adjacent
    ? scored(60, `${band} employees is close to your target sizes.`)
    : scored(20, `${band} employees is outside your target sizes.`);
}

function qualificationFit(
  lead: ScorableLead,
  config: SalesAgentConfig,
): {
  factor: FactorOutcome;
  met: string[];
  failed: string[];
  unknown: string[];
  requiredFailed: string[];
  requiredUnknown: string[];
} {
  const met: string[] = [];
  const failed: string[] = [];
  const unknownRules: string[] = [];
  const requiredFailed: string[] = [];
  const requiredUnknown: string[] = [];
  for (const rule of config.qualification.rules) {
    const outcome = evaluateRule(lead, rule);
    (outcome === "met" ? met : outcome === "failed" ? failed : unknownRules).push(rule.label);
    if (rule.required && outcome === "failed") requiredFailed.push(rule.label);
    if (rule.required && outcome === "unknown") requiredUnknown.push(rule.label);
  }
  const evaluated = met.length + failed.length;
  if (config.qualification.rules.length === 0) {
    return {
      factor: notApplicable("No qualification rules configured."),
      met,
      failed,
      unknown: unknownRules,
      requiredFailed,
      requiredUnknown,
    };
  }
  if (evaluated === 0) {
    return {
      factor: unknown("Not enough data to check your qualification rules."),
      met,
      failed,
      unknown: unknownRules,
      requiredFailed,
      requiredUnknown,
    };
  }
  const score = Math.round((met.length / evaluated) * 100);
  return {
    factor: scored(
      score,
      `Meets ${met.length} of ${evaluated} checkable rules${unknownRules.length ? ` (${unknownRules.length} unknown)` : ""}.`,
    ),
    met,
    failed,
    unknown: unknownRules,
    requiredFailed,
    requiredUnknown,
  };
}

const ENGAGEMENT_BY_STATUS: Partial<Record<LeadStatus, number>> = {
  CONTACTED: 30,
  ENGAGED: 60,
  INTERESTED: 80,
  MEETING_REQUESTED: 90,
  MEETING_BOOKED: 100,
  PROPOSAL: 100,
  NEGOTIATION: 100,
  WON: 100,
  LOST: 10,
};

function engagement(lead: ScorableLead): FactorOutcome {
  const score = ENGAGEMENT_BY_STATUS[lead.status];
  return score === undefined
    ? notApplicable("No interaction yet.")
    : scored(score, `Current stage: ${lead.status.toLowerCase().replace(/_/g, " ")}.`);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function bandFor(score: number, bands: SalesAgentConfig["scoring"]["bands"]): ScoreBand {
  if (score >= bands.hot) return "hot";
  if (score >= bands.high) return "high";
  if (score >= bands.medium) return "medium";
  if (score >= bands.low) return "low";
  return "very_low";
}

/**
 * Weighted average of scored factors, shrunk toward UNKNOWN_PRIOR by the share
 * of *relevant* weight that is unknown. `raw` is the unshrunk average.
 */
function weightedAverage(
  factors: FactorResult[],
  keys?: readonly ScoreFactor[],
): { score: number | null; raw: number | null; coverage: number } {
  const pool = (keys ? factors.filter((f) => keys.includes(f.key)) : factors).filter(
    (f) => f.weight > 0 && f.state !== "not_applicable",
  );
  const relevantWeight = pool.reduce((sum, f) => sum + f.weight, 0);
  const known = pool.filter((f) => f.state === "scored");
  const knownWeight = known.reduce((sum, f) => sum + f.weight, 0);
  if (relevantWeight === 0) return { score: null, raw: null, coverage: 0 };
  const coverage = knownWeight / relevantWeight;
  if (knownWeight === 0) return { score: UNKNOWN_PRIOR, raw: null, coverage: 0 };
  const raw = known.reduce((sum, f) => sum + f.weight * (f.score ?? 0), 0) / knownWeight;
  return {
    score: clamp(coverage * raw + (1 - coverage) * UNKNOWN_PRIOR),
    raw: clamp(raw),
    coverage,
  };
}

export function scoreLead(
  lead: ScorableLead,
  config: SalesAgentConfig,
  signals: ScoreSignals = {},
): LeadScoreResult {
  const weights = config.scoring.weights;
  const qual = qualificationFit(lead, config);
  const raw: Record<ScoreFactor, FactorOutcome> = {
    industryFit: industryFit(lead, config),
    locationFit: locationFit(lead, config),
    roleRelevance: roleRelevance(lead, config),
    companySizeFit: companySizeFit(lead, config),
    qualificationFit: qual.factor,
    problemRelevance:
      signals.problemRelevance === null || signals.problemRelevance === undefined
        ? notApplicable("Not researched yet.")
        : scored(clamp(signals.problemRelevance), "From prospect research."),
    intent:
      lead.intentScore === null || lead.intentScore === undefined
        ? notApplicable("No buying signals yet.")
        : scored(clamp(lead.intentScore), "From conversation analysis."),
    engagement: engagement(lead),
  };
  const factors: FactorResult[] = SCORE_FACTORS.map((key) => ({
    key,
    label: FACTOR_LABELS[key],
    weight: weights[key],
    ...raw[key],
  }));

  const overall = weightedAverage(factors);
  const fit = weightedAverage(factors, FIT_FACTORS);

  // Qualification verdict: required rules first, then fit vs. strictness. Unknown never counts as a pass.
  const threshold = STRICTNESS_THRESHOLD[config.behavior.qualificationStrictness];
  /** Configured ICP targets the lead clearly misses (scored ≤ 20). */
  const hardMismatches = factors
    .filter(
      (f) => HARD_MISMATCH_FACTORS.includes(f.key) && f.state === "scored" && (f.score ?? 0) <= 20,
    )
    .map((f) => f.label);
  let verdict: QualificationVerdict;
  if (qual.requiredFailed.length > 0) {
    verdict = {
      status: "UNQUALIFIED",
      met: qual.met,
      failed: qual.failed,
      unknown: qual.unknown,
      reason: `Fails required rule: ${qual.requiredFailed.join("; ")}.`,
    };
  } else if (qual.requiredUnknown.length > 0 || fit.raw === null || fit.coverage < 0.5) {
    verdict = {
      status: "NEEDS_REVIEW",
      met: qual.met,
      failed: qual.failed,
      unknown: qual.unknown,
      reason:
        qual.requiredUnknown.length > 0
          ? `Missing data for required rule: ${qual.requiredUnknown.join("; ")}.`
          : "Not enough information to judge fit — research the lead or add details.",
    };
  } else if ((fit.score ?? 0) >= threshold && hardMismatches.length > 0) {
    // A clear miss on a configured target (e.g. wrong industry) is never auto-qualified.
    verdict = {
      status: "NEEDS_REVIEW",
      met: qual.met,
      failed: qual.failed,
      unknown: qual.unknown,
      reason: `Good overall fit, but outside your targets: ${hardMismatches.join(", ").toLowerCase()}.`,
    };
  } else if ((fit.score ?? 0) >= threshold) {
    verdict = {
      status: "QUALIFIED",
      met: qual.met,
      failed: qual.failed,
      unknown: qual.unknown,
      reason: `Fit score ${fit.score} meets your ${threshold}+ bar.`,
    };
  } else {
    verdict = {
      status: "UNQUALIFIED",
      met: qual.met,
      failed: qual.failed,
      unknown: qual.unknown,
      reason: `Fit score ${fit.score} is below your ${threshold}+ bar.`,
    };
  }

  // Opted-out leads are never prioritised.
  const leadScore = lead.status === "DO_NOT_CONTACT" ? 0 : (overall.score ?? 0);
  return {
    version: SCORING_VERSION,
    leadScore,
    qualificationScore: fit.score,
    band: bandFor(leadScore, config.scoring.bands),
    confidence: Math.round(overall.coverage * 100) / 100,
    factors,
    qualification: verdict,
  };
}
