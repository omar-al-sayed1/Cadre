import type { ProspectDiscovery } from "./schemas-discovery";

/** Comparable form of a URL: lower-case host without "www.", no fragment, no trailing slash. */
export function comparableUrl(raw: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    url.hash = "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * Keeps only what the search actually returned: source URLs must match a
 * search result, prospects without a matching source are dropped, and a
 * contact without a matching source is removed. Duplicate company names are
 * collapsed. Nothing is added — this only ever removes.
 */
export function keepSourcedProspects(
  discovery: ProspectDiscovery,
  results: Array<{ url: string }>,
  limit: number,
): ProspectDiscovery {
  const known = new Map<string, string>();
  for (const r of results) {
    const key = comparableUrl(r.url);
    if (key) known.set(key, r.url);
  }
  const seen = new Set<string>();
  let unsourced = 0;
  const prospects: ProspectDiscovery["prospects"] = [];
  for (const p of discovery.prospects) {
    const sourceUrls = [
      ...new Set(
        p.sourceUrls
          .map((u) => comparableUrl(u))
          .filter((k): k is string => k !== null && known.has(k))
          .map((k) => known.get(k)!),
      ),
    ];
    if (sourceUrls.length === 0) {
      unsourced += 1;
      continue;
    }
    const nameKey = p.companyName.trim().toLowerCase();
    if (seen.has(nameKey)) continue;
    seen.add(nameKey);
    const contactKey = p.contact ? comparableUrl(p.contact.sourceUrl) : null;
    prospects.push({
      ...p,
      sourceUrls,
      contact:
        p.contact && contactKey && known.has(contactKey)
          ? { ...p.contact, sourceUrl: known.get(contactKey)! }
          : null,
    });
    if (prospects.length >= limit) break;
  }
  const notes = [...discovery.notes];
  if (unsourced > 0)
    notes.push(
      `${unsourced} ${unsourced === 1 ? "company was" : "companies were"} left out because no search result supported ${unsourced === 1 ? "it" : "them"}.`,
    );
  return { ...discovery, prospects, notes: notes.slice(0, 10) };
}
