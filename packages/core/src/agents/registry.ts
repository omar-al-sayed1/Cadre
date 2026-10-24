import { PRODUCTS, listProducts, type ProductDefinition, type ProductKey } from "@repo/config";
import { db } from "@repo/database";
import { startOfMonthUtc, type AgentType } from "@repo/shared";
import { parseSalesAgentConfig } from "@repo/validation";
import { can, type ActorContext } from "../context";
import type { Permission } from "../permissions";
import { getProductAccess, type ProductAccess } from "../services/subscriptions";

/**
 * Agent registry (spec §120–122). Each AI employee registers one definition;
 * the marketplace, navigation, entitlement checks and usage reporting are all
 * driven from here, so adding a new employee doesn't touch platform code.
 */
export interface AgentUsageMetric {
  key: string;
  label: string;
  value: number;
  /** Plan limit for this metric (null = unlimited / not limited). */
  limit: number | null;
}

export interface AgentDefinition {
  type: AgentType;
  productKey: ProductKey;
  /** Permission needed to open the product at all. */
  readPermission: Permission;
  /** What the agent can do (marketing + capability discovery). */
  getCapabilities(): string[];
  /** Validated, defaulted configuration for a company (null when the agent has none). */
  getConfiguration(companyId: string): Promise<unknown>;
  /** Month-to-date usage against plan limits. */
  getUsage(companyId: string, access: ProductAccess): Promise<AgentUsageMetric[]>;
}

const interviewerAgent: AgentDefinition = {
  type: "INTERVIEWER",
  productKey: "interviewer",
  readPermission: "job.read",
  getCapabilities: () => PRODUCTS.interviewer.capabilities,
  // The interviewer is configured per interview template, not per company.
  getConfiguration: async () => null,
  async getUsage(companyId, access) {
    const interviews = await db.interviewSession.count({
      where: { companyId, createdAt: { gte: startOfMonthUtc() } },
    });
    return [
      {
        key: "interviewsPerMonth",
        label: "Interviews this month",
        value: interviews,
        limit: access.plan?.limits.interviewsPerMonth ?? null,
      },
    ];
  },
};

const salesAgent: AgentDefinition = {
  type: "SALES",
  productKey: "sales-agent",
  readPermission: "sales.read",
  getCapabilities: () => PRODUCTS["sales-agent"].capabilities,
  async getConfiguration(companyId) {
    const agent = await db.agent.findUnique({
      where: { companyId_type: { companyId, type: "SALES" } },
    });
    return parseSalesAgentConfig(agent?.config);
  },
  async getUsage(companyId, access) {
    const since = startOfMonthUtc();
    const [leads, aiOps] = await Promise.all([
      db.salesLead.count({ where: { companyId, createdAt: { gte: since } } }),
      db.aiUsageEvent.count({
        where: { companyId, agentType: "SALES", success: true, createdAt: { gte: since } },
      }),
    ]);
    return [
      {
        key: "leadsPerMonth",
        label: "Leads added this month",
        value: leads,
        limit: access.plan?.limits.leadsPerMonth ?? null,
      },
      {
        key: "aiOperationsPerMonth",
        label: "AI operations this month",
        value: aiOps,
        limit: access.plan?.limits.aiOperationsPerMonth ?? null,
      },
    ];
  },
};

const REGISTRY = new Map<ProductKey, AgentDefinition>();

export function registerAgent(definition: AgentDefinition): void {
  REGISTRY.set(definition.productKey, definition);
}

registerAgent(interviewerAgent);
registerAgent(salesAgent);

export function getAgentDefinition(productKey: ProductKey): AgentDefinition | null {
  return REGISTRY.get(productKey) ?? null;
}

/** Every product in the catalogue, with its agent definition when implemented. */
export function getAvailableAgents(): Array<{
  product: ProductDefinition;
  definition: AgentDefinition | null;
}> {
  return listProducts().map((product) => ({
    product,
    definition: REGISTRY.get(product.key) ?? null,
  }));
}

/** Can this user open this product right now? (entitlement AND role). */
export async function checkAgentAccess(
  ctx: ActorContext,
  productKey: ProductKey,
): Promise<{
  allowed: boolean;
  reason: "ok" | "not_subscribed" | "no_permission" | "not_implemented";
  access: ProductAccess;
}> {
  const access = await getProductAccess(ctx.companyId, productKey);
  const definition = REGISTRY.get(productKey);
  if (!definition) return { allowed: false, reason: "not_implemented", access };
  if (!access.active) return { allowed: false, reason: "not_subscribed", access };
  if (!can(ctx, definition.readPermission))
    return { allowed: false, reason: "no_permission", access };
  return { allowed: true, reason: "ok", access };
}
