/**
 * Normalisation used for duplicate detection and matching. Pure functions:
 * the same input always produces the same key.
 */

/** Webmail domains never identify a prospect's company. */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.fr",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
]);

const COMPANY_SUFFIXES =
  /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|sal|sarl|sa|gmbh|plc|group|holding|holdings)\b/g;

export function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/** Lower-cased, accent-free, single-spaced. Keeps letters of any script. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

/** Digits only, with a leading "+" kept; null when too short to be a phone number. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 7) return null;
  return trimmed.startsWith("+") || trimmed.startsWith("00") ? `+${digits}` : digits;
}

/** Registrable-ish host without protocol, "www." or path. */
export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = url
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
  return host && host.includes(".") ? host : null;
}

export function domainFromEmail(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const domain = normalized.split("@")[1] ?? "";
  return domain && !FREE_EMAIL_DOMAINS.has(domain) ? domain : null;
}

/** The company domain for a lead: website first, then a non-webmail email domain. */
export function leadDomain(lead: {
  website?: string | null;
  email?: string | null;
}): string | null {
  return domainFromUrl(lead.website) ?? domainFromEmail(lead.email);
}

export function normalizeCompanyName(name: string | null | undefined): string {
  // Drop abbreviation dots first so "S.A.L." becomes "sal".
  return normalizeText(name?.replace(/\./g, ""))
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePersonName(name: string | null | undefined): string {
  return normalizeText(name);
}

export function buildFullName(lead: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
}): string {
  const person = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return person || lead.companyName?.trim() || lead.email?.trim() || "Unnamed lead";
}

/** Split "Jane Q. Doe" into first / last. */
export function splitFullName(fullName: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? null };
}
