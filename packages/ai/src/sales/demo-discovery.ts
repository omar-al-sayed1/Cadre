import { prospectDiscoverySchema, type ProspectDiscovery } from "./schemas-discovery";
import type { DiscoverProspectsInput } from "./types";

/**
 * DEMO_MODE stand-in for prospect discovery. Without a real search source it
 * cannot know real companies, so it returns clearly fictional sample companies
 * (".example" domains, labelled as samples) built from the ICP — enough to try
 * the review-and-add flow. It never presents them as real.
 */

const STEMS = [
  "Northwind",
  "Bluebird",
  "Silverline",
  "Cedarpoint",
  "Brightway",
  "Lakeside",
  "Summit",
  "Harborview",
  "Oakridge",
  "Sunrise",
  "Granite",
  "Riverbend",
  "Maple",
  "Crescent",
  "Evergreen",
  "Horizon",
  "Pinecrest",
  "Copperleaf",
  "Westgate",
  "Starling",
  "Ironwood",
  "Clearwater",
  "Fairview",
  "Kingsbridge",
  "Larkspur",
];

function suffixesFor(industry: string | null): string[] {
  const i = (industry ?? "").toLowerCase();
  if (/real ?estate|propert|realt|housing|developer/.test(i))
    return ["Realty", "Properties", "Estates"];
  if (/software|saas|tech|it\b|digital/.test(i)) return ["Labs", "Software", "Digital"];
  if (/restaurant|food|hospitality|hotel|cafe/.test(i)) return ["Kitchen", "Hospitality", "Dining"];
  if (/clinic|health|medical|dental|pharma/.test(i)) return ["Clinic", "Health", "Care"];
  if (/school|education|training|academy/.test(i)) return ["Academy", "Learning", "Institute"];
  if (/law|legal/.test(i)) return ["Legal", "Law Partners", "Advisory"];
  if (/retail|shop|store|e-?commerce/.test(i)) return ["Stores", "Market", "Retail"];
  if (/construct|engineering/.test(i)) return ["Builders", "Engineering", "Construction"];
  return ["Group", "Partners", "Co."];
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

export function demoDiscoverProspects(input: DiscoverProspectsInput): ProspectDiscovery {
  const c = input.criteria;
  const industries = c.industries.length ? c.industries : [null];
  const excludedNames = new Set(input.exclude.names.map((n) => n.trim().toLowerCase()));
  const excludedDomains = new Set(input.exclude.domains.map((d) => d.toLowerCase()));
  const prospects: ProspectDiscovery["prospects"] = [];

  for (let i = 0; prospects.length < c.count && i < STEMS.length * 3; i += 1) {
    const industry = industries[i % industries.length] ?? null;
    const suffixes = suffixesFor(industry);
    const stem = STEMS[i % STEMS.length]!;
    const suffix = suffixes[Math.floor(i / STEMS.length) % suffixes.length]!;
    const companyName = `${stem} ${suffix}`;
    const domain = `${slug(companyName)}.example`;
    if (excludedNames.has(companyName.toLowerCase()) || excludedDomains.has(domain)) continue;
    const country = c.countries.length ? c.countries[i % c.countries.length]! : null;
    const city = c.cities.length ? c.cities[i % c.cities.length]! : null;
    const companySize = c.companySizes.length ? c.companySizes[i % c.companySizes.length]! : null;
    const reasons = [
      industry ? `Industry matches “${industry}”.` : null,
      country ? `Located in ${city ? `${city}, ` : ""}${country}.` : null,
      companySize ? `Size ${companySize} employees is in your target range.` : null,
    ].filter((r): r is string => r !== null);
    prospects.push({
      companyName,
      website: `https://${domain}`,
      industry,
      city,
      country,
      companySize,
      description: `Fictional sample company for demo mode${industry ? ` (${industry.toLowerCase()})` : ""}. Not a real business.`,
      matchReasons: reasons,
      contact: null,
      publicEmail: null,
      publicPhone: null,
      sourceUrls: [],
      confidence: 0.5,
    });
  }

  return prospectDiscoverySchema.parse({
    prospects,
    searchSummary: `Demo mode: ${prospects.length} fictional sample companies matching your criteria, so you can try reviewing and adding discovered leads.`,
    notes: [
      "Demo mode can't search the web. These companies are fictional samples on .example domains — don't contact them.",
      "Set AI_API_KEY (Claude) and DEMO_MODE=false to find real companies with web search.",
    ],
  });
}
