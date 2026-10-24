import { asJson, db, type TransactionClient } from "@repo/database";
import type { ActorType } from "@repo/shared";
import type { ActorContext } from "../../context";
import { requireSalesRead } from "./access";

/**
 * Sales activity log (spec §28, §62): the lead timeline and the "what is my AI
 * doing" feed. Every AI action is recorded with actorType AI; entries are
 * append-only and only ever describe things that actually happened.
 */
export const SALES_ACTIVITY = {
  leadCreated: "lead.created",
  leadImported: "lead.imported",
  leadUpdated: "lead.updated",
  leadStatusChanged: "lead.status_changed",
  leadScored: "lead.scored",
  leadDeleted: "lead.deleted",
  leadsImported: "leads.imported",
  aiCopilotAnswered: "ai.copilot_answered",
  aiCopilotFailed: "ai.copilot_failed",
  aiResearched: "ai.researched",
  aiResearchFailed: "ai.research_failed",
  aiDraftGenerated: "ai.draft_generated",
  aiReplyAnalyzed: "ai.reply_analyzed",
  messageLogged: "message.logged",
  messageMarkedSent: "message.marked_sent",
  draftUpdated: "draft.updated",
  leadSuppressed: "lead.suppressed",
  leadDiscovered: "lead.discovered",
  aiDiscovered: "ai.discovered",
  aiDiscoveryFailed: "ai.discovery_failed",
  agentConfigured: "agent.configured",
  agentStatusChanged: "agent.status_changed",
} as const;
export type SalesActivityType = (typeof SALES_ACTIVITY)[keyof typeof SALES_ACTIVITY];

export interface RecordActivityInput {
  companyId: string;
  leadId?: string | null;
  actorType: ActorType;
  actorUserId?: string | null;
  type: SalesActivityType;
  summary: string;
  metadata?: Record<string, unknown>;
}

export async function recordSalesActivity(
  input: RecordActivityInput,
  tx?: TransactionClient,
): Promise<void> {
  await (tx ?? db).salesActivity.create({
    data: {
      companyId: input.companyId,
      leadId: input.leadId ?? null,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      type: input.type,
      summary: input.summary.slice(0, 500),
      metadata: asJson(input.metadata ?? {}),
    },
  });
}

export interface SalesActivityView {
  id: string;
  leadId: string | null;
  leadName: string | null;
  actorType: ActorType;
  actorName: string | null;
  type: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listSalesActivity(
  ctx: ActorContext,
  options: { leadId?: string; limit?: number; before?: Date } = {},
): Promise<SalesActivityView[]> {
  requireSalesRead(ctx);
  const rows = await db.salesActivity.findMany({
    where: {
      companyId: ctx.companyId,
      ...(options.leadId ? { leadId: options.leadId } : {}),
      ...(options.before ? { createdAt: { lt: options.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 30, 100),
    include: { lead: { select: { fullName: true, deletedAt: true } } },
  });
  const userIds = [
    ...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id))),
  ];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  return rows.map((r) => ({
    id: r.id,
    leadId: r.lead && !r.lead.deletedAt ? r.leadId : null,
    leadName: r.lead?.fullName ?? null,
    actorType: r.actorType,
    actorName:
      r.actorType === "AI"
        ? "AI Sales Agent"
        : (users.find((u) => u.id === r.actorUserId)?.name ?? null),
    type: r.type,
    summary: r.summary,
    metadata: (r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
      ? r.metadata
      : {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }));
}
