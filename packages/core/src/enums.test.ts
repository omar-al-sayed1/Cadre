import { describe, expect, it } from "vitest";
import * as prisma from "@repo/database/enums";
import * as shared from "@repo/shared";

/** The browser-safe arrays in @repo/shared must mirror the Prisma enums exactly. */
const PAIRS: Array<[string, readonly string[], Record<string, string>]> = [
  ["CompanyRole", shared.COMPANY_ROLES, prisma.CompanyRole],
  ["SubscriptionStatus", shared.SUBSCRIPTION_STATUSES, prisma.SubscriptionStatus],
  ["AgentType", shared.AGENT_TYPES, prisma.AgentType],
  ["AgentStatus", shared.AGENT_STATUSES, prisma.AgentStatus],
  ["ActorType", shared.ACTOR_TYPES, prisma.ActorType],
  ["LeadStatus", shared.LEAD_STATUSES, prisma.LeadStatus],
  ["LeadSource", shared.LEAD_SOURCES, prisma.LeadSource],
  ["ResearchStatus", shared.RESEARCH_STATUSES, prisma.ResearchStatus],
  ["SalesChannel", shared.SALES_CHANNELS, prisma.SalesChannel],
  ["MessageDirection", shared.MESSAGE_DIRECTIONS, prisma.MessageDirection],
  ["SalesMessageStatus", shared.SALES_MESSAGE_STATUSES, prisma.SalesMessageStatus],
  ["SuppressionReason", shared.SUPPRESSION_REASONS, prisma.SuppressionReason],
  ["SessionStatus", shared.SESSION_STATUSES, prisma.SessionStatus],
  ["NotificationType", shared.NOTIFICATION_TYPES, prisma.NotificationType],
];

describe("shared enums mirror the database", () => {
  it.each(PAIRS)("%s", (_name, values, prismaEnum) => {
    expect([...values].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});
