import { db } from "@repo/database";
import { startOfMonthUtc, type LeadStatus } from "@repo/shared";
import {
  CONTACTED_OR_LATER,
  INTERESTED_OR_LATER,
  isContactable,
  MEETING_OR_LATER,
  QUALIFIED_OR_LATER,
} from "@repo/sales-engine";
import type { ActorContext } from "../../context";
import { getProductAccess, type ProductAccess } from "../subscriptions";
import { requireSalesRead } from "./access";
import { listSalesActivity, SALES_ACTIVITY, type SalesActivityView } from "./activity";
import { getSalesAgent, type SalesAgentView } from "./agent";
import { toLeadView, type LeadView } from "./leads";

/**
 * "What is my AI sales employee doing?" (spec §6–8). Every number comes from
 * stored records — nothing is estimated or simulated. Metrics that need data
 * this phase doesn't collect yet (emails, deals) are reported as null so the UI
 * can say so instead of showing a fake zero.
 */
export interface SalesDashboard {
  agent: Pick<
    SalesAgentView,
    "id" | "name" | "status" | "onboardingCompleted" | "completedSections"
  >;
  access: Pick<ProductAccess, "status" | "trialDaysLeft" | "active">;
  stats: {
    totalLeads: number;
    newLeads: number;
    qualifiedLeads: number;
    contactedLeads: number;
    interestedLeads: number;
    meetingsBooked: number;
    customersWon: number;
    /** won ÷ leads that reached at least "contacted", in percent; null without data. */
    conversionRate: number | null;
    /** Requires deals (later phase). */
    estimatedPipeline: number | null;
  };
  today: {
    leadsAdded: number;
    leadsScored: number;
    statusChanges: number;
    aiAnswers: number;
    leadsResearched: number;
    draftsGenerated: number;
    /** Requires email integration (later phase). */
    emailsSent: number | null;
    followUpsSent: number | null;
    /** Replies logged or received today. */
    responsesReceived: number;
    meetingsBooked: number;
  };
  goals: {
    leads: { target: number | null; actual: number };
    meetings: { target: number | null; actual: number };
    customers: { target: number | null; actual: number };
  };
  statusCounts: Record<LeadStatus, number>;
  priorityLeads: LeadView[];
  activity: SalesActivityView[];
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getSalesDashboard(ctx: ActorContext): Promise<SalesDashboard> {
  requireSalesRead(ctx);
  const companyId = ctx.companyId;
  const today = startOfTodayUtc();
  const month = startOfMonthUtc();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const live = { companyId, deletedAt: null };

  const repliesToday = await db.salesMessage.count({
    where: { companyId, direction: "INBOUND", occurredAt: { gte: today } },
  });
  const [
    agent,
    access,
    grouped,
    newLeads,
    todayActivity,
    monthStatusChanges,
    monthLeads,
    priority,
    activity,
  ] = await Promise.all([
    getSalesAgent(ctx),
    getProductAccess(companyId, "sales-agent"),
    db.salesLead.groupBy({ by: ["status"], where: live, _count: { _all: true } }),
    db.salesLead.count({ where: { ...live, createdAt: { gte: weekAgo } } }),
    db.salesActivity.groupBy({
      by: ["type"],
      where: { companyId, createdAt: { gte: today } },
      _count: { _all: true },
    }),
    db.salesActivity.findMany({
      where: { companyId, type: SALES_ACTIVITY.leadStatusChanged, createdAt: { gte: month } },
      select: { metadata: true, createdAt: true, leadId: true },
    }),
    db.salesLead.count({ where: { companyId, createdAt: { gte: month } } }),
    db.salesLead.findMany({
      where: {
        ...live,
        status: {
          in: [
            "NEW",
            "RESEARCHING",
            "QUALIFIED",
            "CONTACTED",
            "ENGAGED",
            "INTERESTED",
            "MEETING_REQUESTED",
          ],
        },
        leadScore: { not: null },
      },
      orderBy: [{ leadScore: "desc" }, { updatedAt: "desc" }],
      take: 5,
      include: { owner: { select: { id: true, name: true } } },
    }),
    listSalesActivity(ctx, { limit: 25 }),
  ]);

  const statusCounts = Object.fromEntries(
    (
      [
        "NEW",
        "RESEARCHING",
        "QUALIFIED",
        "UNQUALIFIED",
        "CONTACTED",
        "ENGAGED",
        "INTERESTED",
        "MEETING_REQUESTED",
        "MEETING_BOOKED",
        "PROPOSAL",
        "NEGOTIATION",
        "WON",
        "LOST",
        "DO_NOT_CONTACT",
      ] as LeadStatus[]
    ).map((s) => [s, 0]),
  ) as Record<LeadStatus, number>;
  for (const g of grouped) statusCounts[g.status] = g._count._all;
  const sum = (statuses: readonly LeadStatus[]) =>
    statuses.reduce((n, s) => n + statusCounts[s], 0);
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const contacted = sum(CONTACTED_OR_LATER) + statusCounts.LOST;
  const won = statusCounts.WON;

  const countToday = (type: string) => todayActivity.find((a) => a.type === type)?._count._all ?? 0;
  const reached = (statuses: readonly LeadStatus[], since: Date) =>
    new Set(
      monthStatusChanges
        .filter((c) => c.createdAt >= since)
        .filter((c) => {
          const to = (c.metadata as { to?: string } | null)?.to;
          return Boolean(to && (statuses as readonly string[]).includes(to));
        })
        .map((c) => c.leadId),
    ).size;

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      onboardingCompleted: agent.onboardingCompleted,
      completedSections: agent.completedSections,
    },
    access: { status: access.status, trialDaysLeft: access.trialDaysLeft, active: access.active },
    stats: {
      totalLeads: total,
      newLeads: newLeads,
      qualifiedLeads: sum(QUALIFIED_OR_LATER),
      contactedLeads: sum(CONTACTED_OR_LATER),
      interestedLeads: sum(INTERESTED_OR_LATER),
      meetingsBooked: sum(MEETING_OR_LATER),
      customersWon: won,
      conversionRate: contacted > 0 ? Math.round((won / contacted) * 1000) / 10 : null,
      estimatedPipeline: null,
    },
    today: {
      leadsAdded: countToday(SALES_ACTIVITY.leadCreated) + countToday(SALES_ACTIVITY.leadImported),
      leadsScored: countToday(SALES_ACTIVITY.leadScored),
      statusChanges: countToday(SALES_ACTIVITY.leadStatusChanged),
      aiAnswers: countToday(SALES_ACTIVITY.aiCopilotAnswered),
      leadsResearched: countToday(SALES_ACTIVITY.aiResearched),
      draftsGenerated: countToday(SALES_ACTIVITY.aiDraftGenerated),
      emailsSent: null,
      followUpsSent: null,
      responsesReceived: repliesToday,
      meetingsBooked: reached(["MEETING_BOOKED"], today),
    },
    goals: {
      leads: { target: agent.config.goals.monthlyLeads, actual: monthLeads },
      meetings: {
        target: agent.config.goals.monthlyMeetings,
        actual: reached(MEETING_OR_LATER, month),
      },
      customers: { target: agent.config.goals.monthlyCustomers, actual: reached(["WON"], month) },
    },
    statusCounts,
    priorityLeads: priority.filter((l) => isContactable(l.status)).map(toLeadView),
    activity,
  };
}
