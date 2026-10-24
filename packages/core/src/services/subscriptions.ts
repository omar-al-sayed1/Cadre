import {
  isProductKey,
  PLANS,
  PRODUCT_PLAN_DEFAULTS,
  PRODUCTS,
  listProducts,
  type ProductDefinition,
  type ProductKey,
  type ProductLimits,
} from "@repo/config";
import { asJson, db, type Plan, type ProductSubscription } from "@repo/database";
import { AppError, type SubscriptionStatus } from "@repo/shared";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, requireSuperAdmin, type ActorContext } from "../context";

/**
 * Subscriptions & entitlements (spec §67–71). A company subscribes to each AI
 * employee (product) separately. Access is decided here, on the server, for
 * every request: the UI hides unavailable products, but never decides.
 *
 *   ACTIVE                  → access
 *   TRIALING (not expired)  → access until trialEndsAt
 *   PAST_DUE                → access (grace period; shown as a warning)
 *   CANCELED / EXPIRED      → no new work; existing data stays readable
 */

const ACCESS_STATUSES: readonly SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE"];

export interface PlanSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number | null;
  currency: string;
  limits: ProductLimits;
  features: string[];
  trialDays: number;
}

export interface ProductAccess {
  product: ProductDefinition;
  /** Effective status (a lapsed trial reports EXPIRED), or null if never subscribed. */
  status: SubscriptionStatus | null;
  active: boolean;
  trialEndsAt: Date | null;
  trialDaysLeft: number | null;
  plan: PlanSummary | null;
  /** True when the company may start a free trial now. */
  canStartTrial: boolean;
}

function effectiveStatus(
  sub: Pick<ProductSubscription, "status" | "trialEndsAt">,
  now = new Date(),
): SubscriptionStatus {
  if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt <= now) return "EXPIRED";
  return sub.status;
}

function planLimits(plan: Plan): ProductLimits {
  const stored = (
    plan.limits && typeof plan.limits === "object" && !Array.isArray(plan.limits) ? plan.limits : {}
  ) as Record<string, unknown>;
  const limits: ProductLimits = {};
  for (const key of [
    "interviewsPerMonth",
    "leadsPerMonth",
    "aiOperationsPerMonth",
    "mailboxes",
    "seats",
  ] as const) {
    const value = stored[key];
    if (value === null || typeof value === "number") limits[key] = value;
  }
  // Interviewer plans keep their limits in dedicated columns.
  if (plan.productKey === "interviewer") {
    limits.interviewsPerMonth = plan.monthlyInterviewLimit;
    limits.seats = plan.seats;
  }
  return limits;
}

export function toPlanSummary(plan: Plan): PlanSummary {
  const features = Array.isArray(plan.features)
    ? plan.features.filter((f): f is string => typeof f === "string")
    : [];
  // Enterprise plans stored at 0 are "custom pricing", not free.
  const custom = plan.key.endsWith("enterprise") && plan.priceMonthlyCents === 0;
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    priceMonthlyCents: custom ? null : plan.priceMonthlyCents,
    currency: plan.currency,
    limits: planLimits(plan),
    features,
    trialDays: plan.trialDays,
  };
}

/** Create missing catalogue plans (never overwrites edited rows). Idempotent. */
export async function ensureProductPlans(): Promise<void> {
  const interviewer = Object.values(PLANS).map((p, i) => ({
    key: p.key,
    productKey: "interviewer",
    name: p.name,
    monthlyInterviewLimit: p.monthlyInterviewLimit,
    monthlyAiBudgetUsd: p.monthlyAiBudgetUsd,
    seats: p.seats,
    priceMonthlyCents: p.priceMonthlyCents,
    sortOrder: i + 1,
  }));
  for (const plan of interviewer) {
    await db.plan.upsert({ where: { key: plan.key }, update: {}, create: plan });
  }
  for (const plan of PRODUCT_PLAN_DEFAULTS) {
    await db.plan.upsert({
      where: { key: plan.key },
      update: {},
      create: {
        key: plan.key,
        productKey: plan.productKey,
        name: plan.name,
        description: plan.description,
        priceMonthlyCents: plan.priceMonthlyCents ?? 0,
        trialDays: plan.trialDays,
        sortOrder: plan.sortOrder,
        limits: asJson(plan.limits),
        features: asJson(plan.features),
        seats: plan.limits.seats ?? null,
      },
    });
  }
}

export async function listProductPlans(productKey: ProductKey): Promise<PlanSummary[]> {
  await ensureProductPlans();
  const plans = await db.plan.findMany({
    where: { productKey, isPublic: true },
    orderBy: [{ sortOrder: "asc" }, { priceMonthlyCents: "asc" }],
  });
  return plans.map(toPlanSummary);
}

function toAccess(
  product: ProductDefinition,
  sub: (ProductSubscription & { plan: Plan | null }) | null,
  now = new Date(),
): ProductAccess {
  if (!sub) {
    return {
      product,
      status: null,
      active: false,
      trialEndsAt: null,
      trialDaysLeft: null,
      plan: null,
      canStartTrial: product.availability === "available",
    };
  }
  const status = effectiveStatus(sub, now);
  const trialDaysLeft =
    status === "TRIALING" && sub.trialEndsAt
      ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
      : null;
  return {
    product,
    status,
    active: ACCESS_STATUSES.includes(status),
    trialEndsAt: sub.trialEndsAt,
    trialDaysLeft,
    plan: sub.plan ? toPlanSummary(sub.plan) : null,
    // One free trial per product per company.
    canStartTrial:
      product.availability === "available" &&
      !ACCESS_STATUSES.includes(status) &&
      !sub.trialStartedAt,
  };
}

/** Access to every product for a company (marketplace, navigation). */
export async function listProductAccess(companyId: string): Promise<ProductAccess[]> {
  const subs = await db.productSubscription.findMany({
    where: { companyId },
    include: { plan: true },
  });
  return listProducts().map((product) =>
    toAccess(product, subs.find((s) => s.productKey === product.key) ?? null),
  );
}

export async function getProductAccess(
  companyId: string,
  productKey: ProductKey,
): Promise<ProductAccess> {
  const sub = await db.productSubscription.findUnique({
    where: { companyId_productKey: { companyId, productKey } },
    include: { plan: true },
  });
  return toAccess(PRODUCTS[productKey], sub);
}

/** Server-side gate used by every product service. */
export async function assertEntitled(
  companyId: string,
  productKey: ProductKey,
): Promise<ProductAccess> {
  const access = await getProductAccess(companyId, productKey);
  if (!access.active) {
    throw new AppError("PRODUCT_NOT_ENABLED", {
      message:
        access.status === "EXPIRED"
          ? `Your ${access.product.name} trial has ended. Subscribe in the AI Marketplace to continue.`
          : `${access.product.name} isn't active for this workspace. Start a trial in the AI Marketplace.`,
    });
  }
  return access;
}

function requireProductKey(value: string): ProductKey {
  if (!isProductKey(value)) throw new AppError("NOT_FOUND", { message: "Unknown product." });
  return value;
}

/** Start a free trial of a product (once per product per company). */
export async function startProductTrial(
  ctx: ActorContext,
  rawProductKey: string,
): Promise<ProductAccess> {
  requirePermission(ctx, "billing.manage");
  const productKey = requireProductKey(rawProductKey);
  const product = PRODUCTS[productKey];
  if (product.availability !== "available" || !product.trialPlanKey) {
    throw new AppError("CONFLICT", { message: `${product.name} isn't available yet.` });
  }
  const current = await getProductAccess(ctx.companyId, productKey);
  if (current.active) return current;
  if (!current.canStartTrial) {
    throw new AppError("CONFLICT", {
      message: `Your ${product.name} trial has already been used. Contact us to subscribe.`,
    });
  }
  await ensureProductPlans();
  const plan = await db.plan.findUniqueOrThrow({ where: { key: product.trialPlanKey } });
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + plan.trialDays * 86_400_000);
  await db.$transaction(async (tx) => {
    await tx.productSubscription.upsert({
      where: { companyId_productKey: { companyId: ctx.companyId, productKey } },
      update: {
        status: "TRIALING",
        planId: plan.id,
        trialStartedAt: now,
        trialEndsAt,
        canceledAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      },
      create: {
        companyId: ctx.companyId,
        productKey,
        planId: plan.id,
        status: "TRIALING",
        trialStartedAt: now,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      },
    });
    // The interviewer's legacy quota code reads company.planId; keep it in sync.
    if (productKey === "interviewer")
      await tx.company.update({ where: { id: ctx.companyId }, data: { planId: plan.id } });
    if (product.agentType !== "INTERVIEWER") {
      await tx.agent.upsert({
        where: { companyId_type: { companyId: ctx.companyId, type: product.agentType } },
        update: {},
        create: {
          companyId: ctx.companyId,
          type: product.agentType,
          name: product.name,
          status: "SETUP",
        },
      });
    }
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.subscriptionTrialStarted,
        entityType: "product_subscription",
        entityId: productKey,
        metadata: { planKey: plan.key, trialEndsAt: trialEndsAt.toISOString() },
      },
      tx,
    );
  });
  return getProductAccess(ctx.companyId, productKey);
}

export async function cancelProductSubscription(
  ctx: ActorContext,
  rawProductKey: string,
): Promise<ProductAccess> {
  requirePermission(ctx, "billing.manage");
  const productKey = requireProductKey(rawProductKey);
  const sub = await db.productSubscription.findUnique({
    where: { companyId_productKey: { companyId: ctx.companyId, productKey } },
  });
  if (!sub || !ACCESS_STATUSES.includes(effectiveStatus(sub))) {
    throw new AppError("CONFLICT", { message: "There's no active subscription to cancel." });
  }
  await db.productSubscription.update({
    where: { id: sub.id },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.subscriptionCanceled,
    entityType: "product_subscription",
    entityId: productKey,
  });
  return getProductAccess(ctx.companyId, productKey);
}

/** Platform admin: set a company's subscription directly (manual billing until a payment provider is connected). */
export async function adminSetSubscription(
  actor: { userId: string; platformRole: ActorContext["platformRole"] },
  companyId: string,
  input: { productKey: string; status: SubscriptionStatus; planKey?: string },
): Promise<void> {
  requireSuperAdmin(actor);
  const productKey = requireProductKey(input.productKey);
  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new AppError("NOT_FOUND", { message: "Company not found." });
  await ensureProductPlans();
  const plan = input.planKey
    ? await db.plan.findFirst({ where: { key: input.planKey, productKey } })
    : null;
  if (input.planKey && !plan)
    throw new AppError("VALIDATION_FAILED", {
      message: "That plan doesn't belong to this product.",
    });
  const now = new Date();
  await db.productSubscription.upsert({
    where: { companyId_productKey: { companyId, productKey } },
    update: {
      status: input.status,
      ...(plan ? { planId: plan.id } : {}),
      ...(input.status === "CANCELED" ? { canceledAt: now } : {}),
      ...(input.status === "ACTIVE" ? { currentPeriodStart: now, canceledAt: null } : {}),
    },
    create: {
      companyId,
      productKey,
      status: input.status,
      planId: plan?.id ?? null,
      currentPeriodStart: now,
    },
  });
  if (productKey === "interviewer" && plan)
    await db.company.update({ where: { id: companyId }, data: { planId: plan.id } });
  const product = PRODUCTS[productKey];
  if (product.agentType !== "INTERVIEWER" && ACCESS_STATUSES.includes(input.status)) {
    await db.agent.upsert({
      where: { companyId_type: { companyId, type: product.agentType } },
      update: {},
      create: { companyId, type: product.agentType, name: product.name, status: "SETUP" },
    });
  }
  await audit(
    { system: true, companyId },
    {
      action: AUDIT_ACTIONS.subscriptionChanged,
      entityType: "product_subscription",
      entityId: productKey,
      metadata: { status: input.status, planKey: plan?.key ?? null, by: actor.userId },
    },
  );
}

/** Limits of the company's current plan for a product (empty = no plan → no extra limits). */
export async function getProductLimits(
  companyId: string,
  productKey: ProductKey,
): Promise<ProductLimits> {
  const access = await getProductAccess(companyId, productKey);
  return access.plan?.limits ?? {};
}
