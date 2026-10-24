import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { brand, isProductKey, PRODUCTS } from "@repo/config";
import { can, listProductPlans } from "@repo/core";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { cn } from "@repo/ui/cn";
import { PageHeader } from "@/components/common";
import { formatPrice, SubscriptionStatusBadge } from "@/components/marketplace/product-card";
import { CancelSubscriptionButton, StartTrialButton } from "@/components/marketplace/trial-button";
import { ProductIcon } from "@/components/product-icon";
import { formatDate } from "@/lib/format";
import { requireActor } from "@/server/auth-context";
import { getWorkspaceProducts } from "@/server/products";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ productKey: string }>;
}): Promise<Metadata> {
  const { productKey } = await params;
  return { title: isProductKey(productKey) ? PRODUCTS[productKey].name : "AI Marketplace" };
}

const LIMIT_LABELS: Record<string, string> = {
  interviewsPerMonth: "interviews / month",
  leadsPerMonth: "leads / month",
  aiOperationsPerMonth: "AI operations / month",
  mailboxes: "mailboxes",
  seats: "users",
};

export default async function MarketplaceProductPage({
  params,
}: {
  params: Promise<{ productKey: string }>;
}) {
  const { productKey } = await params;
  if (!isProductKey(productKey)) notFound();
  const actor = await requireActor();
  const access = (await getWorkspaceProducts(actor.companyId)).find(
    (p) => p.product.key === productKey,
  );
  if (!access) notFound();
  const { product } = access;
  const plans = product.availability === "available" ? await listProductPlans(productKey) : [];
  const canManage = can(actor, "billing.manage");
  const setupPath =
    productKey === "sales-agent"
      ? "/sales/setup"
      : productKey === "interviewer"
        ? "/onboarding"
        : (product.appPath ?? "/home");
  const trialPlan = plans.find((p) => p.key === product.trialPlanKey);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" /> AI Marketplace
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {product.name}{" "}
            <SubscriptionStatusBadge status={access.status} trialDaysLeft={access.trialDaysLeft} />
          </span>
        }
        description={product.description}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center gap-4">
            <ProductIcon name={product.icon} size="lg" />
            <div>
              <CardTitle>{product.tagline}</CardTitle>
              <p className="text-sm text-muted-foreground">{product.category}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {product.capabilities.map((c) => (
                <li key={c} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
            {product.landingPath ? (
              <Link
                href={product.landingPath}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Learn how it works <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {product.availability === "coming_soon" ? (
              <p className="text-muted-foreground">
                {product.name} is coming soon. We&apos;ll let you know when it&apos;s available.
              </p>
            ) : access.active ? (
              <>
                <p>
                  {access.status === "TRIALING"
                    ? `Free trial of the ${access.plan?.name ?? ""} plan — ends ${formatDate(access.trialEndsAt)}.`
                    : `Active on the ${access.plan?.name ?? "current"} plan.`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {product.appPath ? (
                    <Button asChild>
                      <Link href={product.appPath}>
                        Open {product.name} <ArrowRight />
                      </Link>
                    </Button>
                  ) : null}
                  {canManage ? (
                    <CancelSubscriptionButton productKey={product.key} productName={product.name} />
                  ) : null}
                </div>
              </>
            ) : access.canStartTrial ? (
              canManage ? (
                <>
                  <p className="text-muted-foreground">
                    Try every feature of the {trialPlan?.name ?? "Pro"} plan free for{" "}
                    {trialPlan?.trialDays ?? 14} days. No card required.
                  </p>
                  <StartTrialButton
                    productKey={product.key}
                    productName={product.name}
                    next={setupPath}
                    trialDays={trialPlan?.trialDays ?? 14}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">
                  Ask a workspace admin to start a free trial of {product.name}.
                </p>
              )
            ) : (
              <p className="text-muted-foreground">
                {access.status === "EXPIRED"
                  ? "Your free trial has ended."
                  : "This subscription isn't active."}{" "}
                To subscribe, contact{" "}
                <a
                  className="font-medium text-foreground underline"
                  href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(`Subscribe to ${product.name}`)}`}
                >
                  {brand.supportEmail}
                </a>
                . Your data is kept.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {plans.length > 0 ? (
        <section aria-labelledby="plans">
          <h2 id="plans" className="mb-4 text-lg font-semibold">
            Plans
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const current = access.plan?.key === plan.key && access.active;
              return (
                <div
                  key={plan.key}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-card p-5",
                    current && "ring-2 ring-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {current ? <Badge>Current</Badge> : null}
                  </div>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatPrice(plan.priceMonthlyCents, plan.currency)}
                  </p>
                  {plan.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  ) : null}
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {(plan.features.length > 0
                      ? plan.features
                      : Object.entries(plan.limits).map(
                          ([k, v]) =>
                            `${v === null ? "Unlimited" : v.toLocaleString("en")} ${LIMIT_LABELS[k] ?? k}`,
                        )
                    ).map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Prices exclude taxes. Paid plans are activated by our team while online checkout is
            being set up.
          </p>
        </section>
      ) : null}
    </div>
  );
}
