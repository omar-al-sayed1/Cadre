import { db } from "@repo/database";
import type { LeadStatus } from "@repo/shared";
import {
  canTransitionLead,
  LEAD_STATUS_META,
  normalizeEmail,
  normalizePhone,
} from "@repo/sales-engine";
import { audit, AUDIT_ACTIONS } from "../../audit";
import { recordSalesActivity, SALES_ACTIVITY } from "./activity";
import { loadSalesConfig } from "./agent";
import { scoreColumns } from "./leads";

/**
 * Changes made by the AI itself (not a person). Every change goes through the
 * AI transition table, is logged on the lead timeline with actor AI, and is
 * audited. Returns false (and changes nothing) when the transition isn't
 * allowed for the AI — e.g. it can never mark a deal WON or undo an opt-out.
 */
export async function aiChangeLeadStatus(
  companyId: string,
  leadId: string,
  to: LeadStatus,
  reason: string,
): Promise<boolean> {
  const lead = await db.salesLead.findFirst({ where: { id: leadId, companyId, deletedAt: null } });
  if (!lead || !canTransitionLead(lead.status, to, "AI")) return false;
  const config = await loadSalesConfig(companyId);
  const now = new Date();
  const res = await db.salesLead.updateMany({
    where: { id: leadId, companyId, status: lead.status },
    data: {
      status: to,
      statusChangedAt: now,
      ...(to === "DO_NOT_CONTACT" ? { doNotContactAt: now, nextFollowUpAt: null } : {}),
      ...scoreColumns({ ...lead, status: to }, config),
    },
  });
  if (res.count === 0) return false;
  await recordSalesActivity({
    companyId,
    leadId,
    actorType: "AI",
    type: SALES_ACTIVITY.leadStatusChanged,
    summary: `AI moved lead to ${LEAD_STATUS_META[to].label} — ${reason}`,
    metadata: { from: lead.status, to, reason },
  });
  await audit(
    { system: true, companyId },
    {
      action: AUDIT_ACTIONS.salesLeadStatusChanged,
      entityType: "sales_lead",
      entityId: leadId,
      metadata: { from: lead.status, to, actor: "AI", reason },
    },
  );
  return true;
}

// ───────────────────────────── suppression list ─────────────────────────────

/** Add a lead's email and phone to the do-not-contact list (idempotent). */
export async function suppressLead(
  companyId: string,
  lead: { id: string; email: string | null; phone: string | null },
  reason: "UNSUBSCRIBED" | "BOUNCED" | "COMPLAINT" | "MANUAL",
  note?: string,
): Promise<number> {
  const entries: Array<{ kind: string; value: string }> = [];
  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);
  if (email) entries.push({ kind: "email", value: email });
  if (phone) entries.push({ kind: "phone", value: phone });
  for (const e of entries) {
    await db.salesSuppression.upsert({
      where: { companyId_kind_value: { companyId, kind: e.kind, value: e.value } },
      update: {},
      create: {
        companyId,
        kind: e.kind,
        value: e.value,
        reason,
        leadId: lead.id,
        note: note?.slice(0, 300) ?? null,
      },
    });
  }
  return entries.length;
}

/** True when any of the lead's contact details is suppressed. */
export async function isSuppressed(
  companyId: string,
  lead: { email: string | null; phone: string | null },
): Promise<boolean> {
  const values = [normalizeEmail(lead.email), normalizePhone(lead.phone)].filter((v): v is string =>
    Boolean(v),
  );
  if (values.length === 0) return false;
  return (await db.salesSuppression.count({ where: { companyId, value: { in: values } } })) > 0;
}
