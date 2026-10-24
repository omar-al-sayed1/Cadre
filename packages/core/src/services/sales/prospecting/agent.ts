import {
  comparableUrl,
  rulesAssess,
  type AiCallMeta,
  type CompanyEvidence,
  type DiscoveryCriteria,
  type ProspectAssessment,
  type SalesAI,
  type SalesBusinessContext,
} from "@repo/ai";
import {
  categoriesFor,
  cleanNameWord,
  domainFromUrl,
  nameWordsFor,
  normalizeCompanyName,
  sanitizeOsmTags,
} from "@repo/sales-engine";
import { logger } from "@repo/shared";
import { extractLinks } from "../research-providers";
import { crawlCompanySite, fetchPublicPage, type PageFetcher, type SiteReport } from "./crawler";
import { distanceKm } from "./geo";
import { OpenDataError } from "./open-data-http";
import { searchOsm, type OsmPlace } from "./osm";
import { searchWikidata, type WikidataCompany } from "./wikidata";

/**
 * Cadre's prospecting agent: its own research loop over open, permitted
 * sources — no search-engine scraping and no paid search API.
 *
 *   1. plan      the LLM (or built-in rules) turns the ICP into OpenStreetMap
 *                categories, Wikidata industries and directory pages to read
 *   2. gather    OpenStreetMap + Wikidata + directory pages (the LLM reads each
 *                page, extracts listed companies and picks links to follow)
 *   3. merge     one candidate per company; companies already in the CRM are skipped
 *   4. visit     each company's own website: home, contact, about, team pages
 *   5. assess    the LLM (or rules) judges fit and names leaders from those pages
 *   6. rank      best-evidenced matches first
 *
 * Every fact shown to the user comes from a page or record the agent actually
 * retrieved, with its source attached.
 */

export type SearchDepth = "quick" | "deep";

const BUDGETS = {
  quick: { osm: 80, wikidata: 60, listPages: 4, crawl: 16, pagesPerSite: 3, assess: 24 },
  deep: { osm: 250, wikidata: 200, listPages: 20, crawl: 48, pagesPerSite: 4, assess: 60 },
} as const;

/** Sites that list companies but are never prospects themselves. */
const NOT_A_PROSPECT =
  /(^|\.)(linkedin|facebook|instagram|twitter|x|tiktok|youtube|wikipedia|wikidata|openstreetmap|google|bing|yelp|tripadvisor|foursquare|yellowpages|amazon|apple|maps)\.[a-z.]+$/i;

export interface AgentSources {
  osm: typeof searchOsm;
  wikidata: typeof searchWikidata;
  fetchPage: PageFetcher;
}

export interface FoundProspect {
  companyName: string;
  website: string | null;
  domain: string | null;
  websiteCheck: "verified" | "unreachable" | "none";
  industry: string | null;
  city: string | null;
  country: string | null;
  companySize: string | null;
  address: string | null;
  description: string;
  matchReasons: string[];
  people: Array<{ fullName: string; jobTitle: string | null; sourceUrl: string }>;
  email: string | null;
  emailSource: string | null;
  phone: string | null;
  phoneSource: string | null;
  linkedinUrl: string | null;
  sources: Array<{ url: string; title: string | null }>;
  confidence: number;
  /** Where the business is (from open data), and how far from the map centre. */
  lat: number | null;
  lon: number | null;
  distanceKm: number | null;
}

export interface AgentResult {
  prospects: FoundProspect[];
  summary: string;
  notes: string[];
  stats: {
    openDataRecords: number;
    directoryPages: number;
    websitesRead: number;
    pagesRead: number;
  };
}

interface Candidate {
  key: string;
  name: string;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  employees: number | null;
  lat: number | null;
  lon: number | null;
  facts: string[];
  sources: Array<{ url: string; title: string | null }>;
  email: { value: string; source: string } | null;
  phone: { value: string; source: string } | null;
}

function keyFor(name: string, website: string | null): string {
  const domain = domainFromUrl(website);
  return domain ? `d:${domain}` : `n:${normalizeCompanyName(name)}`;
}

function sizeBand(employees: number | null): string | null {
  if (!employees) return null;
  if (employees <= 10) return "1-10";
  if (employees <= 50) return "11-50";
  if (employees <= 200) return "51-200";
  if (employees <= 1000) return "201-1000";
  return "1000+";
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

function fromOsm(p: OsmPlace): Candidate {
  return {
    key: keyFor(p.name, p.website),
    name: p.name,
    website: p.website,
    address: p.address,
    city: p.city,
    country: p.country,
    employees: null,
    facts: [`OpenStreetMap: ${p.category}`, ...(p.address ? [`Address: ${p.address}`] : [])],
    sources: [{ url: p.osmUrl, title: "OpenStreetMap" }],
    email: p.email ? { value: p.email, source: p.osmUrl } : null,
    phone: p.phone ? { value: p.phone, source: p.osmUrl } : null,
    lat: p.lat,
    lon: p.lon,
  };
}

function fromWikidata(c: WikidataCompany): Candidate {
  return {
    key: keyFor(c.name, c.website),
    name: c.name,
    website: c.website,
    address: c.headquarters,
    city: c.headquarters,
    country: null,
    employees: c.employees,
    facts: [
      `Wikidata industry: ${c.industry || "listed"}`,
      ...(c.description ? [`Description: ${c.description}`] : []),
      ...(c.employees ? [`Employees: ${c.employees}`] : []),
      ...(c.headquarters ? [`Headquarters: ${c.headquarters}`] : []),
    ],
    sources: [{ url: c.url, title: "Wikidata" }],
    email: null,
    phone: null,
    lat: c.lat,
    lon: c.lon,
  };
}

function merge(into: Candidate, from: Candidate): void {
  into.website ??= from.website;
  into.address ??= from.address;
  into.city ??= from.city;
  into.country ??= from.country;
  into.employees ??= from.employees;
  into.lat ??= from.lat;
  into.lon ??= from.lon;
  into.email ??= from.email;
  into.phone ??= from.phone;
  for (const f of from.facts) if (!into.facts.includes(f)) into.facts.push(f);
  for (const s of from.sources)
    if (!into.sources.some((x) => x.url === s.url)) into.sources.push(s);
}

/** Directory pages: the LLM reads each page, extracts listed companies and chooses links to follow. */
async function readDirectories(
  ai: SalesAI,
  seeds: string[],
  maxPages: number,
  ctx: { business: SalesBusinessContext; criteria: DiscoveryCriteria; meta: AiCallMeta },
  fetchPage: PageFetcher,
  progress: (message: string) => Promise<void>,
): Promise<{ candidates: Candidate[]; pagesRead: number; notes: string[] }> {
  const queue = [...seeds];
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  let pagesRead = 0;
  let failed = 0;
  while (queue.length > 0 && pagesRead < maxPages) {
    const url = queue.shift()!;
    const key = comparableUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const page = await fetchPage(url);
    if (!page) {
      failed += 1;
      continue;
    }
    pagesRead += 1;
    await progress(`Reading directory pages… (${pagesRead}) ${new URL(page.url).hostname}`);
    const host = new URL(page.url).hostname.replace(/^www\./, "");
    const links = extractLinks(page.html, page.url).filter((l) => /^https?:/.test(l.url));
    const linkSet = new Map(links.map((l) => [comparableUrl(l.url), l.url]));
    let read;
    try {
      read = await ai.readListingPage(
        {
          business: ctx.business,
          criteria: ctx.criteria,
          page: {
            url: page.url,
            title: page.title,
            text: page.text.slice(0, 10_000),
            links: links.slice(0, 250),
          },
        },
        ctx.meta,
      );
    } catch (error) {
      logger.info("prospecting.read_failed", { url: page.url, error });
      continue;
    }
    if (!read.data.relevant) continue;
    for (const company of read.data.companies) {
      // A website counts only if it is really linked from the page and is not the directory itself.
      const linked = company.website ? linkSet.get(comparableUrl(company.website)) : undefined;
      const website =
        linked && new URL(linked).hostname.replace(/^www\./, "") !== host ? linked : null;
      candidates.push({
        key: keyFor(company.name, website),
        name: company.name,
        website,
        address: null,
        city: company.city,
        country: company.country,
        employees: null,
        facts: [`Listed on ${host}${company.evidence ? `: ${company.evidence}` : ""}`],
        sources: [{ url: page.url, title: page.title }],
        email: null,
        phone: null,
        lat: null,
        lon: null,
      });
    }
    for (const next of read.data.followLinks) {
      const real = linkSet.get(comparableUrl(next));
      if (real && new URL(real).hostname.replace(/^www\./, "") === host) queue.push(real);
    }
  }
  return {
    candidates,
    pagesRead,
    notes:
      failed > 0
        ? [
            `${failed} suggested directory page${failed === 1 ? "" : "s"} couldn't be read (missing, blocked by robots.txt, or not public).`,
          ]
        : [],
  };
}

function evidenceFor(c: Candidate, ref: string, site: SiteReport | null): CompanyEvidence {
  const facts = [...c.facts];
  if (site?.description) facts.push(`Description: ${site.description}`);
  if (site?.siteName && site.siteName !== c.name) facts.push(`Website name: ${site.siteName}`);
  if (c.employees) facts.push(`Employees: ${c.employees}`);
  return {
    ref,
    name: c.name,
    website: site?.origin ?? c.website,
    location: c.address ?? ([c.city, c.country].filter(Boolean).join(", ") || null),
    facts: facts.slice(0, 12),
    pages: (site?.pages ?? []).slice(0, 3).map((p) => ({ ...p, text: p.text.slice(0, 1_500) })),
  };
}

export async function runProspectingAgent(input: {
  ai: SalesAI;
  business: SalesBusinessContext;
  criteria: DiscoveryCriteria;
  depth: SearchDepth;
  exclude: { names: Set<string>; domains: Set<string> };
  meta: AiCallMeta;
  onProgress?: (message: string) => Promise<void> | void;
  sources?: Partial<AgentSources>;
  /** Optional extra candidates (e.g. Claude web search when enabled). */
  extraCandidates?: () => Promise<
    Array<{ name: string; website: string | null; sources: string[]; fact: string }>
  >;
}): Promise<AgentResult> {
  const { ai, business, criteria, meta } = input;
  const budget = BUDGETS[input.depth];
  const sources: AgentSources = {
    osm: input.sources?.osm ?? searchOsm,
    wikidata: input.sources?.wikidata ?? searchWikidata,
    fetchPage: input.sources?.fetchPage ?? fetchPublicPage,
  };
  const notes: string[] = [];
  const progress = async (message: string) => {
    await input.onProgress?.(message);
  };

  // 1. Plan.
  await progress("Planning the search…");
  const builtIn = categoriesFor(criteria.industries);
  const plan = await ai.planProspectSearch({ business, criteria }, meta).catch((error) => {
    logger.warn("prospecting.plan_failed", { error });
    notes.push("The AI planner was unavailable, so built-in industry rules were used.");
    return null;
  });
  const tags = sanitizeOsmTags([...(plan?.data.osmTags ?? []), ...builtIn.tags]);
  const nameWords = [
    ...new Set(
      [...(plan?.data.nameKeywords ?? []), ...nameWordsFor(criteria.industries)]
        .map(cleanNameWord)
        .filter((w): w is string => w !== null),
    ),
  ].slice(0, 14);
  const seeds = ai.canReason
    ? (plan?.data.seedUrls ?? []).filter((u) => {
        const domain = domainFromUrl(u);
        return /^https?:\/\//i.test(u) && domain && !NOT_A_PROSPECT.test(domain);
      })
    : [];
  const industries = [
    ...new Set([...(plan?.data.wikidataIndustries ?? []), ...criteria.industries]),
  ];

  // 2. Gather from every source in parallel; one failing source never stops the others.
  await progress("Searching OpenStreetMap, Wikidata and business directories…");
  const sourceNote = (label: string, error: unknown) =>
    notes.push(
      error instanceof OpenDataError
        ? `${error.message} — skipped this time.`
        : `${label} couldn't be searched this time.`,
    );
  const [osm, wiki, directories, extra] = await Promise.all([
    sources
      .osm({
        tags,
        nameWords,
        countries: criteria.countries,
        cities: criteria.cities,
        around: criteria.area ?? null,
        limit: budget.osm,
        minResults: criteria.count * 2,
      })
      .catch((e: unknown) => (sourceNote("OpenStreetMap", e), { places: [], note: null })),
    sources
      .wikidata({
        industries,
        countries: criteria.countries,
        around: criteria.area ?? null,
        limit: budget.wikidata,
      })
      .catch((e: unknown) => (sourceNote("Wikidata", e), { companies: [], note: null })),
    seeds.length > 0
      ? readDirectories(
          ai,
          seeds,
          budget.listPages,
          { business, criteria, meta },
          sources.fetchPage,
          progress,
        )
      : Promise.resolve({ candidates: [], pagesRead: 0, notes: [] as string[] }),
    input.extraCandidates
      ? input.extraCandidates().catch((e: unknown) => (sourceNote("Web search", e), []))
      : Promise.resolve([]),
  ]);
  for (const note of [osm.note, wiki.note, ...directories.notes]) if (note) notes.push(note);

  // 3. Merge by domain, then by name; skip companies already in the CRM.
  const byKey = new Map<string, Candidate>();
  const add = (c: Candidate) => {
    const domain = domainFromUrl(c.website);
    if (domain && NOT_A_PROSPECT.test(domain)) c.website = null;
    const key = keyFor(c.name, c.website);
    c.key = key;
    const existing = byKey.get(key) ?? byKey.get(`n:${normalizeCompanyName(c.name)}`);
    if (existing) merge(existing, c);
    else byKey.set(key, c);
  };
  osm.places.forEach((p) => add(fromOsm(p)));
  wiki.companies.forEach((c) => add(fromWikidata(c)));
  directories.candidates.forEach(add);
  for (const e of extra)
    add({
      key: "",
      name: e.name,
      website: e.website,
      address: null,
      city: null,
      country: null,
      employees: null,
      facts: [e.fact],
      sources: e.sources.map((url) => ({ url, title: null })),
      email: null,
      phone: null,
      lat: null,
      lon: null,
    });
  const fresh = [...byKey.values()].filter((c) => {
    const domain = domainFromUrl(c.website);
    return (
      !(domain && input.exclude.domains.has(domain)) &&
      !input.exclude.names.has(normalizeCompanyName(c.name))
    );
  });
  const openDataRecords = osm.places.length + wiki.companies.length;

  // 4. Visit websites — best-evidenced candidates first.
  const scored = fresh
    .map((c) => ({
      c,
      score:
        (c.website ? 4 : 0) +
        (c.email || c.phone ? 1 : 0) +
        Math.min(2, c.sources.length - 1) +
        (c.employees ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(budget.assess, Math.max(criteria.count * 3, 12)))
    .map((s) => s.c);
  const toVisit = scored.filter((c) => c.website).slice(0, budget.crawl);
  let visited = 0;
  const reports = new Map<string, SiteReport>();
  await progress(`Visiting ${toVisit.length} company websites…`);
  await mapLimit(toVisit, 4, async (c) => {
    const report = await crawlCompanySite(c.website!, {
      maxPages: budget.pagesPerSite,
      fetchPage: sources.fetchPage,
    }).catch(() => null);
    if (report) reports.set(c.key, report);
    visited += 1;
    if (visited % 3 === 0 || visited === toVisit.length)
      await progress(`Visiting company websites… ${visited}/${toVisit.length}`);
  });

  // 5. Assess in small batches (the model sees each company's own pages).
  await progress(`Checking ${scored.length} companies against your ideal customer…`);
  const evidence = scored.map((c, i) => evidenceFor(c, `p${i + 1}`, reports.get(c.key) ?? null));
  const batches: CompanyEvidence[][] = [];
  for (let i = 0; i < evidence.length; i += 5) batches.push(evidence.slice(i, i + 5));
  let fellBack = false;
  const assessed = (
    await mapLimit(batches, 2, async (batch) => {
      try {
        return (await ai.assessProspects({ business, criteria, companies: batch }, meta)).data;
      } catch (error) {
        logger.warn("prospecting.assess_failed", { error });
        fellBack = true;
        return rulesAssess({ business, criteria, companies: batch });
      }
    })
  ).flatMap((a: ProspectAssessment) => a.assessments);
  if (fellBack)
    notes.push(
      "Some companies were checked with keyword rules because the AI model didn't respond.",
    );

  // 6. Build and rank the results.
  const byRef = new Map(scored.map((c, i) => [`p${i + 1}`, c]));
  const prospects: FoundProspect[] = [];
  for (const a of assessed) {
    const c = byRef.get(a.ref);
    if (!c || !a.isCompany || !a.matches) continue;
    const site = reports.get(c.key) ?? null;
    const pageUrls = new Map((site?.pages ?? []).map((p) => [comparableUrl(p.url), p.url]));
    const people = a.people
      .map((p) => ({ ...p, sourceUrl: pageUrls.get(comparableUrl(p.sourceUrl)) ?? "" }))
      .filter((p) => p.sourceUrl);
    const siteEmail = site?.emails[0] ?? null;
    const emailPage = siteEmail
      ? (site?.pages.find((p) => p.text.toLowerCase().includes(siteEmail))?.url ??
        site?.origin ??
        null)
      : null;
    const sitePhone = site?.phones[0] ?? null;
    const sourceList = [
      ...c.sources,
      ...(site?.pages ?? []).slice(0, 2).map((p) => ({ url: p.url, title: p.title })),
    ];
    prospects.push({
      companyName: a.companyName || c.name,
      website: site?.origin ?? c.website,
      domain: domainFromUrl(site?.origin ?? c.website),
      websiteCheck: site?.verified ? "verified" : c.website ? "unreachable" : "none",
      industry: a.industry,
      city: a.city ?? c.city,
      country: a.country ?? c.country,
      companySize: a.companySize ?? sizeBand(c.employees),
      address: c.address,
      description: a.description,
      matchReasons: a.matchReasons,
      people,
      email: siteEmail ?? c.email?.value ?? null,
      emailSource: siteEmail ? emailPage : (c.email?.source ?? null),
      phone: sitePhone ?? c.phone?.value ?? null,
      phoneSource: sitePhone ? (site?.origin ?? null) : (c.phone?.source ?? null),
      linkedinUrl: site?.linkedinUrl ?? null,
      sources: sourceList
        .filter((s, i) => sourceList.findIndex((x) => x.url === s.url) === i)
        .slice(0, 6),
      confidence: a.confidence,
      lat: c.lat,
      lon: c.lon,
      distanceKm:
        criteria.area && c.lat !== null && c.lon !== null
          ? Math.round(distanceKm(criteria.area, { lat: c.lat, lon: c.lon }) * 10) / 10
          : null,
    });
  }
  const rank = (p: FoundProspect) =>
    p.confidence +
    (p.email ? 0.12 : 0) +
    (p.phone ? 0.06 : 0) +
    (p.people.length ? 0.06 : 0) +
    (p.websiteCheck === "verified" ? 0.08 : 0);
  prospects.sort((a, b) => rank(b) - rank(a));
  const final = prospects.slice(0, criteria.count);

  const pagesRead =
    [...reports.values()].reduce((n, r) => n + r.pages.length, 0) + directories.pagesRead;
  const parts = [
    openDataRecords ? `${openDataRecords} open-data records` : null,
    directories.pagesRead ? `${directories.pagesRead} directory pages` : null,
    reports.size ? `${reports.size} company websites (${pagesRead} pages)` : null,
  ].filter(Boolean);
  if (osm.places.length) notes.push("Includes data © OpenStreetMap contributors (ODbL).");
  if (wiki.companies.length) notes.push("Includes data from Wikidata (CC0).");
  if (!ai.canReason)
    notes.push(
      "Matched with keyword rules. Connect an AI model (a free local model works) to read business directories, judge fit more precisely and find named decision makers.",
    );
  return {
    prospects: final,
    summary: parts.length
      ? `Searched ${parts.join(", ")} and found ${final.length} matching ${final.length === 1 ? "company" : "companies"}.`
      : "No sources returned companies for these criteria.",
    notes: notes.slice(0, 10),
    stats: {
      openDataRecords,
      directoryPages: directories.pagesRead,
      websitesRead: reports.size,
      pagesRead,
    },
  };
}
