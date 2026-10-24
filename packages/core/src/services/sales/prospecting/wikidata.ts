import { getServerEnv } from "@repo/config/env";
import { openDataJson } from "./open-data-http";
import { countryCode } from "./regions";

/**
 * Wikidata (CC0) for established companies: organisations whose industry and
 * country match, with official website, size and headquarters when recorded.
 */

export interface WikidataCompany {
  qid: string;
  name: string;
  description: string | null;
  website: string | null;
  employees: number | null;
  headquarters: string | null;
  industry: string;
  /** Headquarters (or company) coordinates, when searching by map area. */
  lat: number | null;
  lon: number | null;
  url: string;
}

const API = "https://www.wikidata.org/w/api.php";

/** Classes too generic to search by (they would match every company in a country). */
const TOO_GENERIC = new Set([
  "Q783794",
  "Q4830453",
  "Q43229",
  "Q6881511",
  "Q891723",
  "Q167037",
  "Q2659904",
]);

/** Industry / company-type items for a plain-language name ("real estate" → Q…). */
async function industryItems(name: string): Promise<Array<{ id: string; label: string }>> {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: "wbsearchentities",
    search: name,
    language: "en",
    type: "item",
    limit: "3",
    format: "json",
  }).toString();
  const data = await openDataJson<{ search?: Array<{ id: string; label?: string }> }>(
    "Wikidata",
    url.toString(),
    { timeoutMs: 20_000 },
  );
  return (data.search ?? [])
    .filter((s) => /^Q\d+$/.test(s.id) && !TOO_GENERIC.has(s.id))
    .map((s) => ({ id: s.id, label: s.label ?? name }));
}

/**
 * SPARQL for companies in any of the industries and countries — or, with
 * `around`, whose headquarters (or the company itself) lies inside the circle.
 * Exported for tests.
 */
export function buildWikidataQuery(
  industryIds: string[],
  isoCodes: string[],
  limit: number,
  around?: { lat: number; lon: number; radiusKm: number } | null,
): string {
  const where = around
    ? `SERVICE wikibase:around {
    ?place wdt:P625 ?loc .
    bd:serviceParam wikibase:center "Point(${around.lon.toFixed(6)} ${around.lat.toFixed(6)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${around.radiusKm}" .
  }
  { ?company wdt:P159 ?place . } UNION { BIND(?place AS ?company) }
  BIND(geof:latitude(?loc) AS ?lat)
  BIND(geof:longitude(?loc) AS ?lon)`
    : `VALUES ?iso { ${isoCodes.map((c) => `"${c}"`).join(" ")} }
  ?country wdt:P297 ?iso .
  ?company wdt:P17 ?country .`;
  return `SELECT ?company ?companyLabel ?companyDescription ?website ?employees ?hqLabel ?industryLabel ?lat ?lon WHERE {
  VALUES ?industry { ${industryIds.map((id) => `wd:${id}`).join(" ")} }
  ${where}
  { ?company wdt:P452 ?industry . } UNION { ?company wdt:P31 ?industry . }
  FILTER NOT EXISTS { ?company wdt:P576 ?dissolved }
  OPTIONAL { ?company wdt:P856 ?website }
  OPTIONAL { ?company wdt:P1128 ?employees }
  OPTIONAL { ?company wdt:P159 ?hq }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,ar". }
}
LIMIT ${Math.max(1, Math.min(limit, 300))}`;
}

interface Binding {
  [key: string]: { value: string } | undefined;
}

export async function searchWikidata(input: {
  industries: string[];
  countries: string[];
  limit: number;
  around?: { lat: number; lon: number; radiusKm: number } | null;
}): Promise<{ companies: WikidataCompany[]; note: string | null }> {
  const isoCodes = input.countries.map(countryCode).filter((c): c is string => c !== null);
  if ((!input.around && isoCodes.length === 0) || input.industries.length === 0)
    return { companies: [], note: "Wikidata skipped: it needs at least one country and industry." };
  // Companies are classified by industry (P452) or by type (P31), so look up both forms.
  const terms = input.industries.slice(0, 3).flatMap((i) => {
    const base = i.replace(/\s+(industry|sector|companies|company)$/i, "");
    return [i, `${base} company`, `${base} industry`];
  });
  const items = (await Promise.all(terms.map((t) => industryItems(t).catch(() => [])))).flat();
  if (items.length === 0) return { companies: [], note: "Wikidata has no matching industry." };
  const url = new URL(getServerEnv().WIKIDATA_SPARQL_URL);
  url.searchParams.set(
    "query",
    buildWikidataQuery([...new Set(items.map((i) => i.id))], isoCodes, input.limit, input.around),
  );
  url.searchParams.set("format", "json");
  const data = await openDataJson<{ results?: { bindings?: Binding[] } }>(
    "Wikidata",
    url.toString(),
    {
      timeoutMs: 45_000,
      accept: "application/sparql-results+json",
    },
  );
  const seen = new Set<string>();
  const companies: WikidataCompany[] = [];
  for (const b of data.results?.bindings ?? []) {
    const uri = b.company?.value ?? "";
    const qid = uri.split("/").pop() ?? "";
    const name = b.companyLabel?.value ?? "";
    if (!/^Q\d+$/.test(qid) || !name || name === qid || seen.has(qid)) continue;
    seen.add(qid);
    const employees = Number(b.employees?.value);
    const lat = Number(b.lat?.value);
    const lon = Number(b.lon?.value);
    companies.push({
      qid,
      name: name.slice(0, 200),
      description: b.companyDescription?.value ?? null,
      website: b.website?.value ?? null,
      employees: Number.isFinite(employees) && employees > 0 ? Math.round(employees) : null,
      headquarters: b.hqLabel?.value ?? null,
      industry: b.industryLabel?.value ?? "",
      lat: b.lat && Number.isFinite(lat) ? lat : null,
      lon: b.lon && Number.isFinite(lon) ? lon : null,
      url: `https://www.wikidata.org/wiki/${qid}`,
    });
  }
  return { companies, note: null };
}
