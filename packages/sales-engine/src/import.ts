import { createLeadSchema, type CreateLeadData, type LeadImportField } from "@repo/validation";
import { normalizeText, splitFullName } from "./normalize";

/**
 * Lead import mapping (spec §14). Headers are matched against synonyms so
 * "company_name", "Company" and "Organisation" all map to `companyName`.
 */
const SYNONYMS: Record<LeadImportField, string[]> = {
  firstName: ["first name", "firstname", "first", "given name", "prenom", "prénom"],
  lastName: ["last name", "lastname", "last", "surname", "family name", "nom"],
  fullName: ["name", "full name", "fullname", "contact", "contact name", "person"],
  companyName: [
    "company",
    "company name",
    "organization",
    "organisation",
    "account",
    "business",
    "business name",
    "societe",
    "société",
    "entreprise",
  ],
  jobTitle: ["title", "job title", "position", "role", "job", "designation", "poste"],
  email: ["email", "email address", "e mail", "mail", "work email", "business email", "courriel"],
  phone: ["phone", "phone number", "mobile", "telephone", "tel", "cell", "whatsapp", "téléphone"],
  website: ["website", "url", "web", "site", "company website", "domain", "site web"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile", "profile url"],
  location: ["location", "address", "region", "area", "adresse"],
  city: ["city", "town", "ville"],
  country: ["country", "nation", "pays"],
  industry: ["industry", "sector", "vertical", "secteur"],
  companySize: [
    "company size",
    "size",
    "employees",
    "employee count",
    "headcount",
    "number of employees",
    "staff",
  ],
  notes: ["notes", "note", "comments", "description", "remarks"],
  tags: ["tags", "tag", "labels", "segment"],
};

export type ImportMapping = Record<string, LeadImportField | null>;

export function autoMapHeaders(headers: readonly string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const used = new Set<LeadImportField>();
  for (const header of headers) {
    const normalized = normalizeText(header.replace(/_/g, " "));
    const field = (Object.keys(SYNONYMS) as LeadImportField[]).find(
      (f) =>
        !used.has(f) &&
        (normalizeText(f.replace(/([A-Z])/g, " $1")) === normalized ||
          SYNONYMS[f].includes(normalized)),
    );
    mapping[header] = field ?? null;
    if (field) used.add(field);
  }
  return mapping;
}

export interface MappedRow {
  rowNumber: number;
  data: CreateLeadData | null;
  errors: string[];
}

/** Apply a mapping to one CSV row and validate it as a lead. */
export function mapImportRow(
  row: Record<string, string>,
  mapping: ImportMapping,
  rowNumber: number,
): MappedRow {
  const values: Partial<Record<LeadImportField, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    const value = row[header]?.trim();
    if (value) values[field] = values[field] ? `${values[field]} ${value}` : value;
  }
  let { firstName, lastName } = values;
  if (values.fullName && !firstName && !lastName) {
    const split = splitFullName(values.fullName);
    firstName = split.firstName ?? undefined;
    lastName = split.lastName ?? undefined;
  }
  const parsed = createLeadSchema.safeParse({
    firstName,
    lastName,
    companyName: values.companyName,
    jobTitle: values.jobTitle,
    email: values.email,
    phone: values.phone,
    website: values.website,
    linkedinUrl: values.linkedinUrl,
    location: values.location,
    city: values.city,
    country: values.country,
    industry: values.industry,
    companySize: values.companySize,
    notes: values.notes,
    tags: values.tags
      ? values.tags
          .split(/[;,|]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [],
    source: "CSV_IMPORT",
  });
  if (!parsed.success) {
    return {
      rowNumber,
      data: null,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`),
    };
  }
  return { rowNumber, data: parsed.data, errors: [] };
}
