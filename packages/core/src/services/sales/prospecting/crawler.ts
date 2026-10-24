import { domainFromUrl } from "@repo/sales-engine";
import {
  assertSafeUrl,
  extractContacts,
  extractLinks,
  extractPage,
  extractSiteName,
  isAllowedByRobots,
  safeGet,
} from "../research-providers";

/**
 * The agent's browser. It reads public pages only: robots.txt is honoured, it
 * identifies itself, it never logs in or submits forms, it is locked down
 * against SSRF (see research-providers), and it reads only a handful of pages
 * per site.
 */

export interface FetchedPage {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  html: string;
}

export type PageFetcher = (url: string) => Promise<FetchedPage | null>;

const robotsCache = new Map<string, Promise<string>>();

async function robotsFor(origin: string): Promise<string> {
  let cached = robotsCache.get(origin);
  if (!cached) {
    cached = safeGet(`${origin}/robots.txt`)
      .then((r) => (r.status === 200 ? r.body.slice(0, 50_000) : ""))
      .catch(() => "");
    robotsCache.set(origin, cached);
    if (robotsCache.size > 500) robotsCache.delete(robotsCache.keys().next().value!);
  }
  return cached;
}

/** Fetch one public HTML page if robots.txt allows it; null otherwise. */
export const fetchPublicPage: PageFetcher = async (rawUrl) => {
  let url: URL;
  try {
    url = assertSafeUrl(rawUrl);
  } catch {
    return null;
  }
  const robots = await robotsFor(url.origin);
  if (robots && !isAllowedByRobots(robots, url.pathname)) return null;
  try {
    const res = await safeGet(url.toString());
    if (res.status < 200 || res.status >= 300 || !/html/i.test(res.contentType)) return null;
    const page = extractPage(res.body);
    return {
      url: res.url,
      title: page.title,
      description: page.description,
      text: page.text,
      html: res.body,
    };
  } catch {
    return null;
  }
};

const INFO_PAGE =
  /contact|about|team|who-?we-?are|our-?story|leadership|management|people|company|founder|staff|equipe|qui-sommes|a-propos|nous-contacter|من-نحن|اتصل/i;

export interface SiteReport {
  verified: boolean;
  origin: string | null;
  siteName: string | null;
  pages: Array<{ url: string; title: string | null; text: string }>;
  description: string | null;
  emails: string[];
  phones: string[];
  linkedinUrl: string | null;
}

const UNREACHABLE: SiteReport = {
  verified: false,
  origin: null,
  siteName: null,
  pages: [],
  description: null,
  emails: [],
  phones: [],
  linkedinUrl: null,
};

/** Read a company's homepage plus its contact / about / team pages. */
export async function crawlCompanySite(
  website: string,
  options: { maxPages: number; fetchPage?: PageFetcher },
): Promise<SiteReport> {
  const fetchPage = options.fetchPage ?? fetchPublicPage;
  let start: URL;
  try {
    start = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return UNREACHABLE;
  }
  const home = await fetchPage(`${start.origin}/`);
  if (!home) return UNREACHABLE;
  const origin = new URL(home.url).origin;
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const internal = extractLinks(home.html, home.url).filter((l) => {
    try {
      const u = new URL(l.url);
      return (
        u.hostname.replace(/^www\./, "") === host &&
        u.pathname !== "/" &&
        (INFO_PAGE.test(u.pathname) || INFO_PAGE.test(l.text))
      );
    } catch {
      return false;
    }
  });
  // Contact pages first, then about / team.
  internal.sort(
    (a, b) =>
      Number(!/contact|اتصل/i.test(a.url + a.text)) - Number(!/contact|اتصل/i.test(b.url + b.text)),
  );
  const pages: FetchedPage[] = [home];
  for (const link of internal) {
    if (pages.length >= options.maxPages) break;
    if (pages.some((p) => p.url === link.url)) continue;
    const page = await fetchPage(link.url);
    if (page) pages.push(page);
  }
  const contacts = extractContacts(pages, domainFromUrl(origin));
  return {
    verified: true,
    origin,
    siteName: extractSiteName(home.html),
    pages: pages.map((p) => ({ url: p.url, title: p.title, text: p.text.slice(0, 2_500) })),
    description: home.description,
    ...contacts,
  };
}
