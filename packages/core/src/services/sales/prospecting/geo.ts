import { openDataJson } from "./open-data-http";

/**
 * Geography for map-based prospecting: distances, a circle's bounding box, and
 * place search / reverse lookup through OpenStreetMap's Nominatim (light,
 * user-triggered use within its usage policy; results are cached).
 */

export interface SearchArea {
  lat: number;
  lon: number;
  radiusKm: number;
  label?: string;
}

const EARTH_RADIUS_KM = 6_371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** south, west, north, east of the circle's bounding box. */
export function boundingBox(area: SearchArea): {
  south: number;
  west: number;
  north: number;
  east: number;
} {
  const dLat = (area.radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const dLon = dLat / Math.max(0.01, Math.cos(rad(area.lat)));
  return {
    south: Math.max(-90, area.lat - dLat),
    north: Math.min(90, area.lat + dLat),
    west: Math.max(-180, area.lon - dLon),
    east: Math.min(180, area.lon + dLon),
  };
}

export function insideArea(area: SearchArea, point: { lat: number; lon: number }): boolean {
  return distanceKm(area, point) <= area.radiusKm;
}

export interface PlaceResult {
  label: string;
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

const ENDPOINT = "https://nominatim.openstreetmap.org";
const cache = new Map<string, { at: number; value: PlaceResult[] }>();
const CACHE_MS = 24 * 3_600_000;

function toPlace(p: NominatimPlace): PlaceResult {
  const a = p.address ?? {};
  return {
    label: p.display_name.split(",").slice(0, 4).join(",").trim(),
    lat: Number(p.lat),
    lon: Number(p.lon),
    city: a.city ?? a.town ?? a.village ?? a.suburb ?? a.county ?? null,
    country: a.country ?? null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
  };
}

async function cached(key: string, load: () => Promise<PlaceResult[]>): Promise<PlaceResult[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

/** Places matching a free-text query (for the map's search box). */
export function geocodePlace(query: string): Promise<PlaceResult[]> {
  const q = query.trim().slice(0, 120);
  return cached(`q:${q.toLowerCase()}`, async () => {
    const url = new URL(`${ENDPOINT}/search`);
    url.search = new URLSearchParams({
      q,
      format: "jsonv2",
      addressdetails: "1",
      limit: "6",
    }).toString();
    const results = await openDataJson<NominatimPlace[]>("Place search", url.toString(), {
      timeoutMs: 15_000,
    });
    return results.map(toPlace).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  });
}

/** The place at a point (city and country), for labelling a map selection. */
export async function reverseGeocode(lat: number, lon: number): Promise<PlaceResult | null> {
  const key = `r:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const [place] = await cached(key, async () => {
    const url = new URL(`${ENDPOINT}/reverse`);
    url.search = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "12",
    }).toString();
    const result = await openDataJson<NominatimPlace & { error?: string }>(
      "Place search",
      url.toString(),
      {
        timeoutMs: 15_000,
      },
    );
    return result.error || !result.lat ? [] : [toPlace(result)];
  });
  return place ?? null;
}
