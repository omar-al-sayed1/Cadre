/**
 * Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF).
 * Header names are normalised to lower_snake_case.
 */
export function parseCsv(input: string): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // strip a UTF-8 BOM (Excel exports)
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headerRow, ...dataRows] = nonEmpty;
  const headers = (headerRow ?? []).map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
  );
  const rows = dataRows.map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])),
  );
  return { headers, rows };
}

/** Common header aliases → canonical candidate CSV columns. */
export const CANDIDATE_HEADER_ALIASES: Record<string, string> = {
  firstname: "first_name",
  first: "first_name",
  given_name: "first_name",
  lastname: "last_name",
  last: "last_name",
  surname: "last_name",
  family_name: "last_name",
  email_address: "email",
  e_mail: "email",
  phone_number: "phone",
  mobile: "phone",
  linkedin_url: "linkedin",
  linkedin_profile: "linkedin",
  city: "location",
};
