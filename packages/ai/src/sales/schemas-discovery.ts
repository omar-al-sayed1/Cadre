import { z } from "zod";

/**
 * Prospect discovery output (spec §13). Companies only come from web search
 * results the model actually received; the platform re-checks every source URL
 * against those results and verifies websites before anything is shown.
 */

export const discoveredProspectSchema = z.object({
  companyName: z.string().min(1).max(200),
  /** The company's own website as shown in the results, or null if none was found. */
  website: z.string().max(300).nullable(),
  industry: z.string().max(120).nullable(),
  city: z.string().max(120).nullable(),
  country: z.string().max(80).nullable(),
  companySize: z.string().max(40).nullable(),
  /** What the company does, in the sources' words. */
  description: z.string().max(600),
  /** Why it matches the ideal customer profile, one reason per entry. */
  matchReasons: z.array(z.string().max(300)).max(5),
  /** A person named publicly in a business role on a cited page — never guessed. */
  contact: z
    .object({
      fullName: z.string().min(1).max(160),
      jobTitle: z.string().max(160).nullable(),
      sourceUrl: z.string().max(500),
    })
    .nullable(),
  /** Generic business contact details shown on the company's own site, or null. */
  publicEmail: z.string().max(254).nullable(),
  publicPhone: z.string().max(40).nullable(),
  /** Search result URLs that support this prospect (at least one). */
  sourceUrls: z.array(z.string().max(500)).max(5),
  confidence: z.number().min(0).max(1),
});
export type DiscoveredProspect = z.infer<typeof discoveredProspectSchema>;

export const prospectDiscoverySchema = z.object({
  prospects: z.array(discoveredProspectSchema).max(25),
  /** One or two sentences on what was searched and how good the matches are. */
  searchSummary: z.string().max(1_000),
  notes: z.array(z.string().max(300)).max(10),
});
export type ProspectDiscovery = z.infer<typeof prospectDiscoverySchema>;

/** How (and whether) this deployment can discover prospects. */
export type DiscoveryMode = "web" | "demo" | "unavailable";

// ───────────────────────────── prospecting agent ─────────────────────────────

/** Step 1 — the planner turns the ICP into open-data queries and pages worth reading. */
export const prospectSearchPlanSchema = z.object({
  /** OpenStreetMap business tags (key=value), e.g. office=estate_agent. */
  osmTags: z.array(z.object({ key: z.string().max(40), value: z.string().max(60) })).max(12),
  /** Industry names to look up on Wikidata. */
  wikidataIndustries: z.array(z.string().max(80)).max(5),
  /** Public directories / association member lists that list such companies (verified by fetching). */
  seedUrls: z.array(z.string().max(300)).max(10),
  /** Words that signal the target industry on a company's website. */
  pageKeywords: z.array(z.string().max(60)).max(20),
  /** Words that appear in such businesses' names, in the local languages too ("Realty", "عقارات"). */
  nameKeywords: z.array(z.string().max(40)).max(12),
  notes: z.array(z.string().max(300)).max(5),
});
export type ProspectSearchPlan = z.infer<typeof prospectSearchPlanSchema>;

/** Step 2 — the reader extracts listed companies from a fetched directory page. */
export const listingReadSchema = z.object({
  relevant: z.boolean(),
  companies: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        /** Only a URL from the page's own links. */
        website: z.string().max(500).nullable(),
        city: z.string().max(120).nullable(),
        country: z.string().max(80).nullable(),
        evidence: z.string().max(300),
      }),
    )
    .max(40),
  /** Pagination / member-list links worth reading next (only from the page's links). */
  followLinks: z.array(z.string().max(500)).max(8),
});
export type ListingRead = z.infer<typeof listingReadSchema>;

/** Step 3 — the assessor judges each gathered company against the ICP. */
export const prospectAssessmentSchema = z.object({
  assessments: z
    .array(
      z.object({
        ref: z.string().max(40),
        /** A real business (not a directory, article, government page or person). */
        isCompany: z.boolean(),
        matches: z.boolean(),
        companyName: z.string().max(200),
        industry: z.string().max(120).nullable(),
        city: z.string().max(120).nullable(),
        country: z.string().max(80).nullable(),
        companySize: z.string().max(40).nullable(),
        description: z.string().max(600),
        matchReasons: z.array(z.string().max(300)).max(5),
        /** People named with a business role on the company's own pages. */
        people: z
          .array(
            z.object({
              fullName: z.string().min(1).max(160),
              jobTitle: z.string().max(160).nullable(),
              sourceUrl: z.string().max(500),
            }),
          )
          .max(5),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(12),
});
export type ProspectAssessment = z.infer<typeof prospectAssessmentSchema>;
