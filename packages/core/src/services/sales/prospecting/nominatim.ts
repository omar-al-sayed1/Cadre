import type { OsmTag } from "@repo/sales-engine";
import { boundingBox, insideArea } from "./geo";
import { openDataJson } from "./open-data-http";
import type { OsmPlace } from "./osm";

/**
 * OpenStreetMap's Nominatim search, used when the Overpass servers are busy.
 * Its usage policy allows light, user-triggered use: we send at most a handful
 * of queries per discovery run, one per second, with an identifying agent.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

interface NominatimResult {
  osm_type: "node" | "way" | "relation";
  osm_id: number;
  name?: string;
  display_name: string;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
  extratags?: Record<string, string> | null;
  address?: Record<string, string>;
}

const BUSINESS = new Set([
  "office",
  "shop",
  "amenity",
  "craft",
  "healthcare",
  "tourism",
  "leisure",
]);

/** Queries such as "estate agent in Beirut, Lebanon" and "realty Beirut, Lebanon" (exported for tests). */
export function nominatimQueries(tags: OsmTag[], nameWords: string[], places: string[]): string[] {
  const where = places.length ? places.join(", ") : "";
  if (!where) return [];
  const phrases = tags.slice(0, 3).map((t) => `${t.value.replace(/_/g, " ")} in ${where}`);
  const names = nameWords.slice(0, 3).map((w) => `${w} ${where}`);
  return [...new Set([...phrases, ...names])].slice(0, 6);
}

function toPlace(r: NominatimResult): OsmPlace | null {
  if (!r.category || !BUSINESS.has(r.category)) return null;
  const name = (r.name || r.display_name.split(",")[0] || "").trim();
  if (!name) return null;
  const extra = r.extratags ?? {};
  const raw = extra.website ?? extra["contact:website"] ?? null;
  const website = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : null;
  const a = r.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.suburb ?? null;
  return {
    id: `${r.osm_type}/${r.osm_id}`,
    name: name.slice(0, 200),
    category: `${r.category}=${r.type ?? "yes"}`,
    website,
    phone: (extra.phone ?? extra["contact:phone"] ?? null)?.split(";")[0]?.trim() ?? null,
    email:
      (extra.email ?? extra["contact:email"] ?? null)?.split(";")[0]?.trim().toLowerCase() ?? null,
    address: r.display_name.split(",").slice(1, 4).join(",").trim() || null,
    city,
    country: a.country ?? null,
    lat: r.lat ? Number(r.lat) : null,
    lon: r.lon ? Number(r.lon) : null,
    osmUrl: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
  };
}

export async function searchNominatim(input: {
  tags: OsmTag[];
  nameWords: string[];
  countries: string[];
  cities: string[];
  /** ISO 3166-1 alpha-2 codes; results outside them are dropped (many towns share country names). */
  countryCodes: string[];
  /** A circle on the map: search inside its box and keep results within the radius. */
  around?: { lat: number; lon: number; radiusKm: number } | null;
}): Promise<OsmPlace[]> {
  const codes = input.around ? [] : input.countryCodes.map((c) => c.toLowerCase());
  const places = input.cities.length
    ? input.cities.map((c) => [c, ...input.countries.slice(0, 1)].join(", "))
    : input.countries;
  const queries = input.around
    ? [
        ...new Set([
          ...input.tags.slice(0, 3).map((t) => t.value.replace(/_/g, " ")),
          ...input.nameWords.slice(0, 3),
        ]),
      ]
    : places.slice(0, 2).flatMap((p) => nominatimQueries(input.tags, input.nameWords, [p]));
  const box = input.around ? boundingBox(input.around) : null;
  const found = new Map<string, OsmPlace>();
  for (const q of queries.slice(0, 6)) {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
      q,
      format: "jsonv2",
      extratags: "1",
      addressdetails: "1",
      limit: "40",
      ...(codes.length ? { countrycodes: codes.join(",") } : {}),
      ...(box
        ? { viewbox: `${box.west},${box.north},${box.east},${box.south}`, bounded: "1" }
        : {}),
    }).toString();
    const results = await openDataJson<NominatimResult[]>("OpenStreetMap search", url.toString(), {
      timeoutMs: 25_000,
    }).catch(() => []);
    for (const r of results) {
      // "Lebanon" is also a town in several US states: trust the address country only.
      if (codes.length && !codes.includes((r.address?.country_code ?? "").toLowerCase())) continue;
      const place = toPlace(r);
      if (!place || found.has(place.id)) continue;
      if (
        input.around &&
        (place.lat === null ||
          place.lon === null ||
          !insideArea(input.around, { lat: place.lat, lon: place.lon }))
      )
        continue;
      found.set(place.id, place);
    }
  }
  return [...found.values()];
}
