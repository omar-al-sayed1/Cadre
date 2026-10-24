import { categoriesFor, keywordMatch, nameWordsFor } from "@repo/sales-engine";
import {
  listingReadSchema,
  prospectAssessmentSchema,
  prospectSearchPlanSchema,
  type ListingRead,
  type ProspectAssessment,
  type ProspectSearchPlan,
} from "./schemas-discovery";
import type { AssessProspectsInput, ProspectPlanInput, ReadListingInput } from "./types";

/**
 * The prospecting agent without a language model: built-in industry → open-data
 * mappings to plan, and keyword rules to judge. Everything still comes from real
 * sources; only the reasoning is simpler (no directory reading, no people).
 */

export function rulesPlan(input: ProspectPlanInput): ProspectSearchPlan {
  const { tags, keywords } = categoriesFor(input.criteria.industries);
  return prospectSearchPlanSchema.parse({
    osmTags: tags.slice(0, 12),
    wikidataIndustries: input.criteria.industries.slice(0, 5),
    seedUrls: [],
    pageKeywords: keywords.slice(0, 20),
    nameKeywords: nameWordsFor(input.criteria.industries).slice(0, 12),
    notes: [
      "Planned with built-in industry rules. Connect an AI model to also read business directories and find named decision makers.",
    ],
  });
}

export function rulesReadListing(_input: ReadListingInput): ListingRead {
  return listingReadSchema.parse({ relevant: false, companies: [], followLinks: [] });
}

function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Company name from a page title: "Cedar Homes | Real estate in Beirut" → "Cedar Homes". */
export function nameFromTitle(title: string | null): string | null {
  if (!title) return null;
  const first = title.split(/\s[|–—-]\s|\s·\s|:\s/)[0]?.trim() ?? "";
  if (first.length < 2 || /^(home|welcome|index|homepage)$/i.test(first)) return null;
  return first.slice(0, 200);
}

export function rulesAssess(input: AssessProspectsInput): ProspectAssessment {
  const { criteria } = input;
  const { keywords } = categoriesFor(criteria.industries);
  const places = [...criteria.cities, ...criteria.countries].map((p) => p.toLowerCase());
  const assessments = input.companies.slice(0, 12).map((c) => {
    const text = [
      c.name,
      c.location,
      ...c.facts,
      ...c.pages.map((p) => `${p.title ?? ""} ${p.text}`),
    ]
      .filter(Boolean)
      .join("\n");
    const industry = keywordMatch(text, keywords);
    const fromOpenData = c.facts.some((f) => /^OpenStreetMap: |^Wikidata industry: /.test(f));
    const placeHit = places.find((p) => text.toLowerCase().includes(p)) ?? null;
    const placeOk = places.length === 0 || Boolean(placeHit) || fromOpenData;
    const industryOk = fromOpenData || industry.matched.length > 0;
    const firstPage = c.pages[0];
    const description =
      c.facts.find((f) => f.startsWith("Description: "))?.slice("Description: ".length) ??
      firstPage?.text.slice(0, 280).replace(/\s+/g, " ").trim() ??
      "";
    const reasons = [
      fromOpenData
        ? `Listed in open data as ${c.facts.find((f) => f.startsWith("OpenStreetMap: ") || f.startsWith("Wikidata industry: "))?.replace(/^[^:]+: /, "")}.`
        : null,
      industry.matched.length
        ? `${c.pages.length ? "Its website mentions" : "Its listing mentions"} ${industry.matched
            .slice(0, 3)
            .map((k) => `“${k}”`)
            .join(", ")}.`
        : null,
      placeHit ? `Located in ${titleCase(placeHit)}.` : null,
    ].filter((r): r is string => r !== null);
    const confidence = Math.min(
      0.85,
      0.3 +
        (fromOpenData ? 0.25 : 0) +
        Math.min(0.2, industry.matched.length * 0.07) +
        (placeHit ? 0.1 : 0),
    );
    return {
      ref: c.ref,
      isCompany: Boolean(c.name || nameFromTitle(firstPage?.title ?? null)),
      matches: industryOk && placeOk,
      companyName: (c.name ?? nameFromTitle(firstPage?.title ?? null) ?? "Unknown company").slice(
        0,
        200,
      ),
      industry:
        criteria.industries.find((i) => text.toLowerCase().includes(i.toLowerCase())) ?? null,
      city: criteria.cities.find((city) => text.toLowerCase().includes(city.toLowerCase())) ?? null,
      country:
        criteria.countries.find((country) => text.toLowerCase().includes(country.toLowerCase())) ??
        null,
      companySize: null,
      description: description.slice(0, 600),
      matchReasons: reasons.slice(0, 5),
      people: [],
      confidence: Math.round(confidence * 100) / 100,
    };
  });
  return prospectAssessmentSchema.parse({ assessments });
}
