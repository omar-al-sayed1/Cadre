import { asJson, db } from "@repo/database";
import { AppError } from "@repo/shared";
import {
  parseSalesAgentConfig,
  SALES_SECTION_SCHEMAS,
  updateSalesConfigSchema,
  type SalesAgentConfig,
  type SalesConfigSection,
} from "@repo/validation";
import { jobQueue } from "@repo/queue";
import { audit, AUDIT_ACTIONS } from "../../audit";
import type { ActorContext } from "../../context";
import { requireSales, requireSalesRead } from "./access";
import { recordSalesActivity, SALES_ACTIVITY } from "./activity";

/**
 * The AI Sales Agent's business configuration: what the company sells, its
 * ideal customer, value proposition, qualification rules, tone, goals, scoring
 * and behaviour (spec §4–5, §72–73). Stored on the company's SALES agent row.
 */

export interface SalesAgentView {
  id: string;
  name: string;
  status: "SETUP" | "ACTIVE" | "PAUSED";
  onboardingCompleted: boolean;
  config: SalesAgentConfig;
  /** Wizard sections that have meaningful content. */
  completedSections: SalesConfigSection[];
  updatedAt: string;
}

/** Sections with enough content to count as "done" in the setup wizard. */
export function completedSections(config: SalesAgentConfig): SalesConfigSection[] {
  const done: SalesConfigSection[] = [];
  if (config.company.name && config.company.description) done.push("company");
  if (config.offering.name && config.offering.description) done.push("offering");
  if (config.icp.industries.length + config.icp.countries.length + config.icp.jobTitles.length > 0)
    done.push("icp");
  if (config.valueProposition.whyBuy || config.valueProposition.problemSolved)
    done.push("valueProposition");
  if (config.qualification.rules.length > 0 || config.qualification.notes)
    done.push("qualification");
  done.push("tone"); // always has a valid default
  if (
    config.goals.monthlyLeads !== null ||
    config.goals.monthlyMeetings !== null ||
    config.goals.monthlyCustomers !== null
  )
    done.push("goals");
  return done;
}

async function loadAgentRow(companyId: string) {
  return db.agent.findUnique({ where: { companyId_type: { companyId, type: "SALES" } } });
}

function toView(agent: NonNullable<Awaited<ReturnType<typeof loadAgentRow>>>): SalesAgentView {
  const config = parseSalesAgentConfig(agent.config);
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    onboardingCompleted: Boolean(agent.onboardingCompletedAt),
    config,
    completedSections: completedSections(config),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

/** Prefill the company profile from the workspace so onboarding starts half done. */
async function initialConfig(companyId: string): Promise<SalesAgentConfig> {
  const company = await db.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true, website: true, industry: true, country: true },
  });
  return parseSalesAgentConfig({
    company: {
      name: company.name,
      website: company.website ?? "",
      industry: company.industry ?? "",
      country: company.country ?? "",
    },
  });
}

export async function getSalesAgent(ctx: ActorContext): Promise<SalesAgentView> {
  requireSalesRead(ctx);
  let agent = await loadAgentRow(ctx.companyId);
  if (!agent) {
    // Created on first access after subscribing (entitlement checked here).
    await requireSales(ctx, "sales.read");
    agent = await db.agent.upsert({
      where: { companyId_type: { companyId: ctx.companyId, type: "SALES" } },
      update: {},
      create: {
        companyId: ctx.companyId,
        type: "SALES",
        name: "AI Sales Agent",
        status: "SETUP",
        config: asJson(await initialConfig(ctx.companyId)),
      },
    });
  } else if (
    agent.config &&
    typeof agent.config === "object" &&
    Object.keys(agent.config).length === 0
  ) {
    agent = await db.agent.update({
      where: { id: agent.id },
      data: { config: asJson(await initialConfig(ctx.companyId)) },
    });
  }
  return toView(agent);
}

/** Config for internal use (scoring, AI) without permission checks — callers have already authorised. */
export async function loadSalesConfig(companyId: string): Promise<SalesAgentConfig> {
  const agent = await loadAgentRow(companyId);
  return parseSalesAgentConfig(agent?.config);
}

export async function updateSalesConfig(
  ctx: ActorContext,
  rawInput: unknown,
): Promise<SalesAgentView> {
  await requireSales(ctx, "sales.configure");
  const input = updateSalesConfigSchema.parse(rawInput);
  const sectionData = SALES_SECTION_SCHEMAS[input.section].parse(input.data);
  const current = await getSalesAgent(ctx);
  const next = parseSalesAgentConfig({ ...current.config, [input.section]: sectionData });
  const finishing = input.completeOnboarding && !current.onboardingCompleted;
  const updated = await db.agent.update({
    where: { id: current.id },
    data: {
      config: asJson(next),
      configVersion: { increment: 1 },
      ...(finishing ? { onboardingCompletedAt: new Date(), status: "ACTIVE" } : {}),
    },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.salesConfigUpdated,
    entityType: "agent",
    entityId: current.id,
    metadata: { section: input.section },
  });
  if (finishing) {
    await recordSalesActivity({
      companyId: ctx.companyId,
      actorType: "USER",
      actorUserId: ctx.userId,
      type: SALES_ACTIVITY.agentConfigured,
      summary: "AI Sales Agent set up and activated",
    });
  }
  // Scoring inputs changed → rescore every lead in the background.
  if (["icp", "qualification", "scoring", "behavior"].includes(input.section)) {
    await jobQueue.enqueue(
      "sales.rescore-leads",
      { companyId: ctx.companyId },
      { uniqueKey: `sales-rescore:${ctx.companyId}:${updated.configVersion}` },
    );
  }
  return toView(updated);
}

export async function setSalesAgentStatus(
  ctx: ActorContext,
  status: "ACTIVE" | "PAUSED",
): Promise<SalesAgentView> {
  await requireSales(ctx, "sales.configure");
  const current = await getSalesAgent(ctx);
  if (!current.onboardingCompleted)
    throw new AppError("CONFLICT", { message: "Finish setting up your AI Sales Agent first." });
  if (current.status === status) return current;
  const updated = await db.agent.update({ where: { id: current.id }, data: { status } });
  await audit(ctx, {
    action: AUDIT_ACTIONS.salesAgentStatusChanged,
    entityType: "agent",
    entityId: current.id,
    metadata: { status },
  });
  await recordSalesActivity({
    companyId: ctx.companyId,
    actorType: "USER",
    actorUserId: ctx.userId,
    type: SALES_ACTIVITY.agentStatusChanged,
    summary: status === "PAUSED" ? "AI Sales Agent paused" : "AI Sales Agent resumed",
  });
  return toView(updated);
}
