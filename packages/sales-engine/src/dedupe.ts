import {
  leadDomain,
  normalizeCompanyName,
  normalizeEmail,
  normalizePersonName,
  normalizePhone,
} from "./normalize";

/**
 * Duplicate detection (spec §15). A lead is a duplicate when any strong key
 * matches an existing lead in the same workspace:
 *
 *   email            same normalised email
 *   phone            same normalised phone number
 *   person+company   same person name at the same (normalised) company
 *   person+domain    same person name at the same company domain
 *   company+domain   company-only leads (no person) with the same company and domain
 */

export type DuplicateKind =
  "email" | "phone" | "person_company" | "person_domain" | "company_domain";

export interface DuplicateKey {
  kind: DuplicateKind;
  value: string;
}

export interface LeadIdentity {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
}

export function duplicateKeys(lead: LeadIdentity): DuplicateKey[] {
  const keys: DuplicateKey[] = [];
  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);
  const person = normalizePersonName([lead.firstName, lead.lastName].filter(Boolean).join(" "));
  const company = normalizeCompanyName(lead.companyName);
  const domain = leadDomain(lead);
  if (email) keys.push({ kind: "email", value: email });
  if (phone) keys.push({ kind: "phone", value: phone });
  if (person && company) keys.push({ kind: "person_company", value: `${person}|${company}` });
  if (person && domain) keys.push({ kind: "person_domain", value: `${person}|${domain}` });
  if (!person && company && domain)
    keys.push({ kind: "company_domain", value: `${company}|${domain}` });
  return keys;
}

export interface DuplicateMatch<T> {
  existing: T;
  kind: DuplicateKind;
}

export const DUPLICATE_REASONS: Record<DuplicateKind, string> = {
  email: "Same email address",
  phone: "Same phone number",
  person_company: "Same person at the same company",
  person_domain: "Same person at the same company domain",
  company_domain: "Same company and website",
};

/** First existing lead sharing a duplicate key with `candidate`, in key priority order. */
export function findDuplicate<T extends LeadIdentity>(
  candidate: LeadIdentity,
  existing: readonly T[],
): DuplicateMatch<T> | null {
  const wanted = duplicateKeys(candidate);
  if (wanted.length === 0) return null;
  const index = new Map<string, T>();
  for (const lead of existing) {
    for (const key of duplicateKeys(lead)) {
      const id = `${key.kind}:${key.value}`;
      if (!index.has(id)) index.set(id, lead);
    }
  }
  for (const key of wanted) {
    const match = index.get(`${key.kind}:${key.value}`);
    if (match) return { existing: match, kind: key.kind };
  }
  return null;
}

/**
 * Incremental index for bulk imports: detects duplicates against existing
 * leads *and* against rows earlier in the same file.
 */
export class DuplicateIndex<T> {
  private readonly index = new Map<string, T>();

  add(lead: LeadIdentity, value: T): void {
    for (const key of duplicateKeys(lead)) {
      const id = `${key.kind}:${key.value}`;
      if (!this.index.has(id)) this.index.set(id, value);
    }
  }

  find(lead: LeadIdentity): { match: T; kind: DuplicateKind } | null {
    for (const key of duplicateKeys(lead)) {
      const match = this.index.get(`${key.kind}:${key.value}`);
      if (match !== undefined) return { match, kind: key.kind };
    }
    return null;
  }
}
