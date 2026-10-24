import { db } from "@repo/database";
import { AppError, startOfMonthUtc } from "@repo/shared";
import { requirePermission, type ActorContext } from "../../context";
import type { Permission } from "../../permissions";
import { assertEntitled } from "../subscriptions";

/**
 * Gate for every AI Sales Agent operation: the user's role must allow the
 * action AND the workspace must be entitled to the product. The company always
 * comes from the authenticated context, never from the request.
 */
export async function requireSales(ctx: ActorContext, permission: Permission): Promise<void> {
  requirePermission(ctx, permission);
  await assertEntitled(ctx.companyId, "sales-agent");
}

/** Read access survives a lapsed subscription so companies keep their data. */
export function requireSalesRead(ctx: ActorContext): void {
  requirePermission(ctx, "sales.read");
}

/** Enforce the plan's monthly lead limit before adding `adding` leads. */
export async function assertLeadQuota(companyId: string, adding: number): Promise<void> {
  const access = await assertEntitled(companyId, "sales-agent");
  const limit = access.plan?.limits.leadsPerMonth ?? null;
  if (limit === null) return;
  const used = await db.salesLead.count({
    where: { companyId, createdAt: { gte: startOfMonthUtc() } },
  });
  if (used + adding > limit) {
    throw new AppError("PLAN_LIMIT_REACHED", {
      message: `Your plan allows ${limit.toLocaleString("en")} new leads per month (${used.toLocaleString("en")} used). Upgrade your plan to add more.`,
    });
  }
}

/** Enforce the plan's monthly AI operation limit. */
export async function assertSalesAiQuota(companyId: string): Promise<void> {
  const access = await assertEntitled(companyId, "sales-agent");
  const limit = access.plan?.limits.aiOperationsPerMonth ?? null;
  if (limit === null) return;
  const used = await db.aiUsageEvent.count({
    where: { companyId, agentType: "SALES", success: true, createdAt: { gte: startOfMonthUtc() } },
  });
  if (used >= limit) {
    throw new AppError("PLAN_LIMIT_REACHED", {
      message: `Your plan's ${limit.toLocaleString("en")} monthly AI operations have been used. Upgrade to continue.`,
    });
  }
}
