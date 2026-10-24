import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { getServerEnv } from "@repo/config/env";

/**
 * Prospect research providers (spec §12–13). Only legally and technically
 * permitted sources: the website provider reads the lead's *own public website*
 * (homepage + an about page), honours robots.txt, identifies itself, and is
 * locked down against SSRF. More providers (CRM, licensed data vendors) plug in
 * behind the same interface.
 */
export interface ResearchSource {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  fetchedAt: string;
}

export interface ResearchGatherResult {
  sources: ResearchSource[];
  /** Human-readable notes about what couldn't be fetched (shown to the user). */
  notes: string[];
}

export interface ResearchProvider {
  readonly name: string;
  /** False when the provider can't fetch anything (research uses the lead record only). */
  readonly fetchesExternalData: boolean;
  gather(input: {
    website: string | null;
    companyName: string | null;
  }): Promise<ResearchGatherResult>;
}

/** No external research: the AI works from the lead record and labels everything else unknown. */
export class LeadRecordOnlyProvider implements ResearchProvider {
  readonly name = "lead-record";
  readonly fetchesExternalData = false;
  async gather(): Promise<ResearchGatherResult> {
    return { sources: [], notes: ["Web research is turned off; only the lead record was used."] };
  }
}

// ───────────────────────────── SSRF protection ─────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const n = ipv4ToInt(address);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (family === 6) {
    const a = address.toLowerCase();
    if (a === "::" || a === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped?.[1]) return isNonPublicAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(a.replace(/^0+/, ""));
  }
  return true;
}

/** Validate a URL before any request: http(s) only, default ports, a real public hostname. */
export function assertSafeUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only http and https links can be researched.");
  if (url.username || url.password) throw new Error("Links with credentials can't be researched.");
  if (url.port && url.port !== "80" && url.port !== "443")
    throw new Error("Only standard web ports can be researched.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    isIP(host)
      ? isNonPublicAddress(host)
      : !host.includes(".") ||
        /\.(local|internal|localhost|home|lan|corp)$/i.test(host) ||
        host === "localhost"
  ) {
    throw new Error("That address isn't a public website.");
  }
  return url;
}

/** DNS lookup that refuses non-public addresses (checked at connect time, so rebinding can't bypass it). */
function safeLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isNonPublicAddress(a.address))) {
      const blocked = new Error(
        `Blocked non-public address for ${hostname}`,
      ) as NodeJS.ErrnoException;
      blocked.code = "EBLOCKED";
      return callback(blocked, "", 0);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

/** Plain-language reason for a failed fetch — raw network errors stay in server logs only. */
export function describeFetchError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code ?? "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "the domain couldn't be found";
  if (code === "EBLOCKED") return "it doesn't point to a public website";
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return "the server refused the connection";
  if (
    code === "ETIMEDOUT" ||
    /too long|timed? ?out/i.test(String((error as Error | null)?.message))
  )
    return "it took too long to respond";
  if (/CERT|SSL|TLS/i.test(code)) return "its security certificate isn't valid";
  if (error instanceof Error && error.message === "Too many redirects.")
    return "it redirected too many times";
  return "a network error occurred";
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8_000;

interface FetchResult {
  status: number;
  url: string;
  contentType: string;
  body: string;
}

function userAgent(): string {
  let appUrl = "";
  try {
    appUrl = getServerEnv().APP_URL;
  } catch {
    // tests without env
  }
  return `CadreResearchBot/1.0 (+${appUrl || "https://example.com"}/legal/privacy)`;
}

/** GET with SSRF-safe DNS, a byte cap, a timeout and at most 3 re-validated redirects. */
export function safeGet(rawUrl: string, redirectsLeft = 3): Promise<FetchResult> {
  const url = assertSafeUrl(rawUrl);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": userAgent(),
          accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
          "accept-language": "en,fr;q=0.8,ar;q=0.7",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error("Too many redirects."));
          const next = new URL(res.headers.location, url).toString();
          safeGet(next, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status,
            url: url.toString(),
            contentType: String(res.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("close", () =>
          resolve({
            status,
            url: url.toString(),
            contentType: String(res.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("The website took too long to respond.")));
    req.on("error", reject);
    req.end();
  });
}

// ───────────────────────────── robots.txt ─────────────────────────────

/** Minimal robots.txt check for our user agent / "*" (Disallow prefixes). */
export function isAllowedByRobots(robots: string, path: string): boolean {
  const groups: Array<{ agents: string[]; disallow: string[]; allow: string[] }> = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.disallow.length + current.allow.length > 0) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && key === "disallow" && value) current.disallow.push(value);
    else if (current && key === "allow" && value) current.allow.push(value);
  }
  const ours =
    groups.find((g) => g.agents.some((a) => a.includes("cadreresearchbot"))) ??
    groups.find((g) => g.agents.includes("*"));
  if (!ours) return true;
  const longest = (rules: string[]) =>
    rules.filter((r) => path.startsWith(r)).reduce((m, r) => Math.max(m, r.length), -1);
  return longest(ours.allow) >= longest(ours.disallow);
}

// ───────────────────────────── HTML → text ─────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

export function extractPage(html: string): {
  title: string | null;
  description: string | null;
  text: string;
} {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1];
  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|section|article|br|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return {
    title: title ? decode(title).replace(/\s+/g, " ").trim().slice(0, 200) : null,
    description: description ? decode(description).trim().slice(0, 400) : null,
    text: text.slice(0, 6_000),
  };
}

/** og:site_name, the cleanest company name a page offers. */
export function extractSiteName(html: string): string | null {
  const raw =
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:site_name["']/i.exec(html)?.[1];
  const name = raw ? decode(raw).replace(/\s+/g, " ").trim() : "";
  return name.length >= 2 ? name.slice(0, 200) : null;
}

/** Absolute http(s) links with their anchor text (fragments removed, deduplicated). */
export function extractLinks(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const out = new Map<string, string>();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const href = decode(m[1] ?? "").trim();
    if (!href || /^(javascript|data|#)/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) && url.protocol !== "mailto:" && url.protocol !== "tel:")
      continue;
    url.hash = "";
    const text = decode((m[2] ?? "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const key = url.toString();
    if (!out.has(key) || (!out.get(key) && text)) out.set(key, text);
    if (out.size >= 800) break;
  }
  return [...out.entries()].map(([url, text]) => ({ url, text }));
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const NOT_CONTACT_EMAIL =
  /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example\.|domain\.|email\.|sentry|wixpress\.com|.*\.wix\.com)|^(no-?reply|donotreply|privacy|abuse|postmaster)@/i;
const ROLE_MAILBOX = /^(info|sales|contact|hello|office|admin|inquiries|enquiries|support|team)@/i;

/**
 * Contact details a business publishes on its own pages: addresses from mailto
 * links and visible text, numbers from tel: links, and its LinkedIn company
 * page. Role mailboxes on the company's own domain come first. Nothing is
 * constructed or guessed.
 */
export function extractContacts(
  pages: Array<{ html: string; url: string }>,
  ownDomain: string | null,
): { emails: string[]; phones: string[]; linkedinUrl: string | null } {
  const emails = new Set<string>();
  const phones = new Set<string>();
  let linkedinUrl: string | null = null;
  for (const page of pages) {
    for (const link of extractLinks(page.html, page.url)) {
      if (link.url.startsWith("mailto:")) {
        const address = decodeURIComponent(link.url.slice(7).split("?")[0] ?? "").trim();
        if (address) emails.add(address.toLowerCase());
      } else if (link.url.startsWith("tel:")) {
        const number = decodeURIComponent(link.url.slice(4)).replace(/[^\d+]/g, "");
        if (number.replace(/\D/g, "").length >= 7) phones.add(number);
      } else if (
        !linkedinUrl &&
        /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[^/?#]+/i.test(link.url)
      ) {
        linkedinUrl = link.url.split("?")[0]!.replace(/\/+$/, "");
      }
    }
    const text = decode(
      page.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "),
    );
    for (const match of text.matchAll(EMAIL_RE)) emails.add(match[0].toLowerCase());
  }
  const clean = [...emails].filter((e) => !NOT_CONTACT_EMAIL.test(e));
  const rank = (e: string) => {
    const sameDomain = ownDomain
      ? e.endsWith(`@${ownDomain}`) || e.endsWith(`.${ownDomain}`)
      : false;
    return (sameDomain ? 0 : 2) + (ROLE_MAILBOX.test(e) ? 0 : 1);
  };
  return {
    emails: clean.sort((a, b) => rank(a) - rank(b)).slice(0, 5),
    phones: [...phones].slice(0, 3),
    linkedinUrl,
  };
}

// ───────────────────────────── website provider ─────────────────────────────

export class WebsiteResearchProvider implements ResearchProvider {
  readonly name = "website";
  readonly fetchesExternalData = true;

  async gather(input: {
    website: string | null;
    companyName: string | null;
  }): Promise<ResearchGatherResult> {
    const notes: string[] = [];
    if (!input.website)
      return {
        sources: [],
        notes: ["No website on the lead record, so no web research was done."],
      };
    let base: URL;
    try {
      base = assertSafeUrl(
        /^https?:\/\//i.test(input.website) ? input.website : `https://${input.website}`,
      );
    } catch (error) {
      return {
        sources: [],
        notes: [error instanceof Error ? error.message : "The website address isn't valid."],
      };
    }
    let robots = "";
    try {
      const res = await safeGet(new URL("/robots.txt", base).toString());
      if (res.status === 200) robots = res.body.slice(0, 50_000);
    } catch {
      // No robots.txt → default allow.
    }
    const sources: ResearchSource[] = [];
    for (const path of ["/", "/about", "/about-us"]) {
      if (sources.length >= 2) break;
      if (path !== "/" && sources.length === 0) break; // homepage unreachable: don't probe further
      if (robots && !isAllowedByRobots(robots, path)) {
        notes.push(`${path} is excluded by the site's robots.txt, so it wasn't read.`);
        continue;
      }
      try {
        const res = await safeGet(new URL(path, base).toString());
        if (res.status !== 200 || !/html|text\/plain/i.test(res.contentType)) {
          if (path === "/") notes.push(`The website returned ${res.status || "no response"}.`);
          continue;
        }
        const page = extractPage(res.body);
        if (page.text.length < 40 && !page.description) continue;
        sources.push({
          url: res.url,
          title: page.title,
          description: page.description,
          text: page.text,
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (path === "/")
          notes.push(`The website couldn't be reached — ${describeFetchError(error)}.`);
      }
    }
    return { sources, notes };
  }
}

export function createResearchProvider(name: "website" | "none"): ResearchProvider {
  return name === "website" ? new WebsiteResearchProvider() : new LeadRecordOnlyProvider();
}
