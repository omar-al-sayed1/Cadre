import { cleanNameWord, type OsmTag } from "@repo/sales-engine";
import { getServerEnv } from "@repo/config/env";
import { searchNominatim } from "./nominatim";
import { openDataJson } from "./open-data-http";
import { countryCode } from "./regions";

/**
 * OpenStreetMap as a business directory (data © OpenStreetMap contributors,
 * ODbL). One Overpass query finds named businesses with the planned tags inside
 * the target countries / cities, with whatever contact details mappers added.
 */

export interface OsmPlace {
  id: string;
  name: string;
  /** e.g. "office=estate_agent" */
  category: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  /** Location (way / relation centre), when known. */
  lat: number | null;
  lon: number | null;
  osmUrl: string;
}

const quote = (value: string) => `"${value.replace(/["\\]/g, "")}"`;

/**
 * Overpass QL for named businesses inside the areas that either carry one of
 * `tags` or have one of `nameWords` in their name (businesses are often mapped
 * as a generic office/shop with a telling name). Exported for tests.
 */
export function buildOverpassQuery(
  tags: OsmTag[],
  area: {
    countryCodes: string[];
    cities: string[];
    /** A circle on the map: replaces countries / cities (and is much faster). */
    around?: { lat: number; lon: number; radiusKm: number } | null;
  },
  limit: number,
  nameWords: string[] = [],
  /** "tags": exact categories only (fast); "names": name matches only (slower); "all": both. */
  part: "all" | "tags" | "names" = "all",
): string | null {
  const words =
    part === "tags" ? [] : nameWords.map(cleanNameWord).filter((w): w is string => w !== null);
  const tagKeys = new Set(tags.map((t) => t.key));
  if (part === "names") tags = [];
  if (
    (tags.length === 0 && words.length === 0) ||
    (!area.around && area.countryCodes.length === 0 && area.cities.length === 0)
  )
    return null;
  const lines = [`[out:json][timeout:${words.length ? 80 : 50}];`];
  let where: string;
  if (area.around) {
    const { lat, lon, radiusKm } = area.around;
    where = `(around:${Math.round(radiusKm * 1000)},${lat.toFixed(6)},${lon.toFixed(6)})`;
  } else if (area.countryCodes.length) {
    lines.push(
      `(${area.countryCodes.map((c) => `area["ISO3166-1"=${quote(c)}][admin_level=2];`).join(" ")})->.countries;`,
    );
    if (area.cities.length) {
      // Resolve cities inside the countries only (a planet-wide name lookup is far too slow).
      // "Beirut" must match "Beirut" and "Beirut Governorate", not "Ras Beirut".
      const exact = (c: string) => quote(`^${c.replace(/[^\p{L}\p{N}\s'-]/gu, "")}( |$)`);
      lines.push(
        `(${area.cities
          .flatMap((c) => [
            `rel(area.countries)["boundary"="administrative"]["name"~${exact(c)},i];`,
            `rel(area.countries)["boundary"="administrative"]["name:en"~${exact(c)},i];`,
            `rel(area.countries)["place"]["name:en"~${exact(c)},i];`,
          ])
          .join(" ")});`,
        "map_to_area->.cities;",
      );
      where = "(area.cities)";
    } else {
      where = "(area.countries)";
    }
  } else {
    lines.push(
      `(${area.cities.flatMap((c) => [`area["name"=${quote(c)}]["boundary"="administrative"];`, `area["name:en"=${quote(c)}]["boundary"="administrative"];`]).join(" ")})->.cities;`,
    );
    where = "(area.cities)";
  }
  const byTag = tags.map((t) => `nwr[${quote(t.key)}=${quote(t.value)}]["name"]${where};`);
  // Indexed key filters + a name regex. Large keys (amenity, healthcare) only when the
  // industry actually uses them — scanning every restaurant in a country is too slow.
  const pattern = quote(words.join("|"));
  const nameKeys = ["office", "shop", "craft", "amenity", "healthcare"].filter(
    (k) => ["office", "shop", "craft"].includes(k) || tagKeys.has(k),
  );
  const byName = words.length
    ? nameKeys.flatMap((key) => [
        `nwr[${quote(key)}]["name"~${pattern},i]${where};`,
        `nwr[${quote(key)}]["name:en"~${pattern},i]${where};`,
      ])
    : [];
  // Probe: how many target areas did this server resolve? (0 = the mirror lacks area data.)
  if (!area.around && area.countryCodes.length) lines.push(".countries out count;");
  lines.push(`(${[...byTag, ...byName].join(" ")});`);
  lines.push(`out center tags ${Math.max(1, Math.min(limit, 500))};`);
  return lines.join("\n");
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function website(tags: Record<string, string>): string | null {
  const raw = tags.website ?? tags["contact:website"] ?? tags.url ?? null;
  if (!raw) return null;
  const first = raw.split(";")[0]!.trim();
  return /^https?:\/\//i.test(first) ? first : `https://${first}`;
}

export function toOsmPlace(element: OverpassElement, tagsWanted: OsmTag[]): OsmPlace | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;
  const category = tagsWanted.find((t) => tags[t.key] === t.value);
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const city = tags["addr:city"] ?? null;
  return {
    id: `${element.type}/${element.id}`,
    name: (tags["name:en"] && tags["name:en"] !== name
      ? `${name} (${tags["name:en"]})`
      : name
    ).slice(0, 200),
    category: category
      ? `${category.key}=${category.value}`
      : (["office", "shop", "amenity", "craft", "healthcare"]
          .filter((k) => tags[k])
          .map((k) => `${k}=${tags[k]} (name match)`)[0] ?? "business"),
    website: website(tags),
    phone: (tags.phone ?? tags["contact:phone"] ?? null)?.split(";")[0]?.trim() ?? null,
    email:
      (tags.email ?? tags["contact:email"] ?? null)?.split(";")[0]?.trim().toLowerCase() ?? null,
    address: [street, city, tags["addr:postcode"]].filter(Boolean).join(", ") || null,
    city,
    country: tags["addr:country"] ?? null,
    lat: element.lat ?? element.center?.lat ?? null,
    lon: element.lon ?? element.center?.lon ?? null,
    osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
  };
}

export async function searchOsm(input: {
  tags: OsmTag[];
  nameWords?: string[];
  countries: string[];
  cities: string[];
  /** A circle on the map; when set, countries / cities are not used for the query. */
  around?: { lat: number; lon: number; radiusKm: number } | null;
  limit: number;
  /** Below this many results in the cities, widen the search to the whole countries. */
  minResults?: number;
}): Promise<{ places: OsmPlace[]; note: string | null }> {
  const countryCodes = input.countries.map(countryCode).filter((c): c is string => c !== null);
  const started = Date.now();
  const run = async (cities: string[], part: "tags" | "names"): Promise<OsmPlace[] | null> => {
    const query = buildOverpassQuery(
      input.tags,
      { countryCodes, cities, around: input.around },
      input.limit,
      input.nameWords,
      part,
    );
    if (!query) return null;
    // Public Overpass servers are often busy: fail over through the configured mirrors.
    const endpoints = getServerEnv()
      .OVERPASS_URL.split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    let data: { elements?: OverpassElement[] } | null = null;
    let lastError: unknown = null;
    for (const endpoint of endpoints) {
      try {
        const response = await openDataJson<{ elements?: OverpassElement[]; remark?: string }>(
          "OpenStreetMap",
          endpoint,
          {
            method: "POST",
            body: new URLSearchParams({ data: query }),
            timeoutMs: part === "names" ? 95_000 : 65_000,
            retryBusy: false,
          },
        );
        // Overpass reports timeouts as HTTP 200 with a remark and partial (often empty) data.
        if (response.remark && /runtime error|timed out|out of memory/i.test(response.remark))
          throw new Error(response.remark);
        const probe = response.elements?.find((e) => (e.type as string) === "count");
        if (countryCodes.length && probe && Number(probe.tags?.areas ?? probe.tags?.total) === 0)
          throw new Error("This Overpass server has no area index");
        data = response;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!data) throw lastError;
    return (data.elements ?? [])
      .map((e) => toOsmPlace(e, input.tags))
      .filter((p): p is OsmPlace => p !== null);
  };
  const merge = (into: OsmPlace[], more: OsmPlace[] | null) => {
    const seen = new Set(into.map((p) => p.id));
    for (const p of more ?? []) if (!seen.has(p.id)) into.push(p);
  };
  /** Optional extra queries only while within a few minutes, and never fatal. */
  const optional = async (cities: string[], part: "tags" | "names") =>
    Date.now() - started > 150_000 ? null : run(cities, part).catch(() => null);
  const hasNameWords = (input.nameWords?.length ?? 0) > 0;

  const fallback = async (note: string) => {
    const places = await searchNominatim({
      tags: input.tags,
      nameWords: input.nameWords ?? [],
      countries: input.countries,
      cities: input.cities,
      countryCodes,
      around: input.around ?? null,
    });
    return { places, note };
  };

  // 1. Exact categories (fast). If every server fails, use the lighter search service.
  let places: OsmPlace[] | null;
  try {
    places = input.tags.length ? await run(input.cities, "tags") : [];
  } catch {
    return fallback(
      "OpenStreetMap's main servers were busy, so its lighter search service was used (fewer results).",
    );
  }
  if (!places || (input.tags.length === 0 && !hasNameWords))
    return {
      places: [],
      note:
        input.tags.length === 0 && !hasNameWords
          ? "OpenStreetMap skipped: no business categories for these industries."
          : "OpenStreetMap skipped: add a country or city to search in.",
    };
  // 2. Businesses with a telling name (best effort; heavier query).
  if (hasNameWords) merge(places, await optional(input.cities, "names"));
  // 3. Too few in the cities: widen to the whole countries.
  const minResults = input.minResults ?? 10;
  if (!input.around && input.cities.length && countryCodes.length && places.length < minResults) {
    const before = places.length;
    merge(places, await optional([], "tags"));
    if (hasNameWords && places.length < minResults) merge(places, await optional([], "names"));
    if (places.length > before)
      return {
        places,
        note: `Few businesses are mapped in ${input.cities.join(", ")}, so the search also covered all of ${input.countries.join(", ")}.`,
      };
  }
  return { places, note: null };
}
