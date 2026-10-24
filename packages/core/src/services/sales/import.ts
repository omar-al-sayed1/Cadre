import { asJson, db } from "@repo/database";
import { AppError } from "@repo/shared";
import {
  autoMapHeaders,
  buildFullName,
  DUPLICATE_REASONS,
  DuplicateIndex,
  leadDomain,
  mapImportRow,
  normalizeEmail,
  normalizePhone,
  scoreLead,
  type ImportMapping,
} from "@repo/sales-engine";
import { leadImportSchema, LEAD_IMPORT_FIELDS, type CreateLeadData } from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../../audit";
import type { ActorContext } from "../../context";
import { parseCsv } from "../../utils/csv";
import { assertLeadQuota, requireSales } from "./access";
import { recordSalesActivity, SALES_ACTIVITY } from "./activity";
import { loadSalesConfig } from "./agent";

/**
 * CSV lead import (spec §14–15): auto-mapped headers, a preview of every row
 * (new / duplicate / invalid) and an explicit commit. Duplicates — against the
 * workspace and within the file — are never inserted.
 */
const MAX_IMPORT_ROWS = 2_000;

export type ImportRowStatus = "new" | "duplicate" | "invalid";

export interface ImportPreviewRow {
  rowNumber: number;
  status: ImportRowStatus;
  name: string | null;
  companyName: string | null;
  email: string | null;
  message: string | null;
  duplicateOf: { id: string | null; name: string } | null;
}

export interface ImportResult {
  headers: string[];
  mapping: ImportMapping;
  fields: readonly string[];
  rows: ImportPreviewRow[];
  counts: { total: number; new: number; duplicate: number; invalid: number };
  committed: boolean;
  created: number;
}

interface IndexedLead {
  id: string | null;
  name: string;
}

export async function importLeads(ctx: ActorContext, rawInput: unknown): Promise<ImportResult> {
  await requireSales(ctx, "sales.import");
  const input = leadImportSchema.parse(rawInput);
  const { headers, rows } = parseCsv(input.csv);
  if (headers.length === 0 || rows.length === 0) {
    throw new AppError("VALIDATION_FAILED", {
      message: "The file has no data rows. Include a header row and at least one lead.",
    });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new AppError("VALIDATION_FAILED", {
      message: `Import up to ${MAX_IMPORT_ROWS.toLocaleString("en")} rows at a time.`,
    });
  }
  const mapping: ImportMapping = input.mapping
    ? Object.fromEntries(headers.map((h) => [h, input.mapping?.[h] ?? null]))
    : autoMapHeaders(headers);
  if (!Object.values(mapping).some(Boolean)) {
    throw new AppError("VALIDATION_FAILED", {
      message: "None of the columns could be matched to lead fields. Map at least one column.",
    });
  }

  // Index existing leads once, then check every row against it (and earlier rows in the file).
  const index = new DuplicateIndex<IndexedLead>();
  const existing = await db.salesLead.findMany({
    where: { companyId: ctx.companyId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      firstName: true,
      lastName: true,
      companyName: true,
      email: true,
      phone: true,
      website: true,
    },
  });
  for (const lead of existing) index.add(lead, { id: lead.id, name: lead.fullName });

  const preview: ImportPreviewRow[] = [];
  const toCreate: CreateLeadData[] = [];
  rows.forEach((row, i) => {
    const rowNumber = i + 2; // header is row 1
    const mapped = mapImportRow(row, mapping, rowNumber);
    if (!mapped.data) {
      preview.push({
        rowNumber,
        status: "invalid",
        name: null,
        companyName: null,
        email: null,
        message: mapped.errors.slice(0, 2).join("; "),
        duplicateOf: null,
      });
      return;
    }
    const name = buildFullName(mapped.data);
    const dup = index.find(mapped.data);
    if (dup) {
      preview.push({
        rowNumber,
        status: "duplicate",
        name,
        companyName: mapped.data.companyName,
        email: mapped.data.email,
        message: dup.match.id
          ? DUPLICATE_REASONS[dup.kind]
          : `${DUPLICATE_REASONS[dup.kind]} as an earlier row`,
        duplicateOf: dup.match,
      });
      return;
    }
    index.add(mapped.data, { id: null, name });
    toCreate.push(mapped.data);
    preview.push({
      rowNumber,
      status: "new",
      name,
      companyName: mapped.data.companyName,
      email: mapped.data.email,
      message: null,
      duplicateOf: null,
    });
  });

  const counts = {
    total: preview.length,
    new: preview.filter((r) => r.status === "new").length,
    duplicate: preview.filter((r) => r.status === "duplicate").length,
    invalid: preview.filter((r) => r.status === "invalid").length,
  };
  const result: ImportResult = {
    headers,
    mapping,
    fields: LEAD_IMPORT_FIELDS,
    rows: preview.slice(0, 500),
    counts,
    committed: false,
    created: 0,
  };
  if (!input.commit || toCreate.length === 0) return result;

  await assertLeadQuota(ctx.companyId, toCreate.length);
  const config = await loadSalesConfig(ctx.companyId);
  const now = new Date();
  const created = await db.$transaction(
    async (tx) => {
      let count = 0;
      for (let start = 0; start < toCreate.length; start += 250) {
        const chunk = toCreate.slice(start, start + 250);
        const res = await tx.salesLead.createMany({
          data: chunk.map((lead) => {
            const score = scoreLead({ ...lead, status: "NEW" }, config);
            return {
              companyId: ctx.companyId,
              firstName: lead.firstName,
              lastName: lead.lastName,
              fullName: buildFullName(lead),
              companyName: lead.companyName,
              jobTitle: lead.jobTitle,
              email: lead.email,
              emailNormalized: normalizeEmail(lead.email),
              phone: lead.phone,
              phoneNormalized: normalizePhone(lead.phone),
              website: lead.website,
              domain: leadDomain(lead),
              linkedinUrl: lead.linkedinUrl,
              location: lead.location,
              city: lead.city,
              country: lead.country,
              industry: lead.industry,
              companySize: lead.companySize,
              notes: lead.notes,
              tags: lead.tags,
              source: "CSV_IMPORT" as const,
              ownerId: ctx.userId,
              createdById: ctx.userId,
              leadScore: score.leadScore,
              qualificationScore: score.qualificationScore,
              scoreBreakdown: asJson(score),
              scoredAt: now,
            };
          }),
        });
        count += res.count;
      }
      await recordSalesActivity(
        {
          companyId: ctx.companyId,
          actorType: "USER",
          actorUserId: ctx.userId,
          type: SALES_ACTIVITY.leadsImported,
          summary: `${ctx.userName} imported ${count} lead${count === 1 ? "" : "s"}${counts.duplicate ? ` (${counts.duplicate} duplicate${counts.duplicate === 1 ? "" : "s"} skipped)` : ""}`,
          metadata: { created: count, duplicates: counts.duplicate, invalid: counts.invalid },
        },
        tx,
      );
      await audit(
        ctx,
        {
          action: AUDIT_ACTIONS.salesLeadsImported,
          entityType: "sales_lead",
          metadata: { created: count, duplicates: counts.duplicate, invalid: counts.invalid },
        },
        tx,
      );
      return count;
    },
    { timeout: 60_000 },
  );
  return { ...result, committed: true, created };
}
