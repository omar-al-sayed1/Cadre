import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { getAgentDefinition, listProductPlans, type AgentUsageMetric } from "@repo/core";
import { db } from "@repo/database";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { EmptyState, PageHeader } from "@/components/common";
import {
  ProductCard,
  startingPrice,
  SubscriptionStatusBadge,
} from "@/components/marketplace/product-card";
import { ProductIcon } from "@/components/product-icon";
import { Eyebrow } from "@/components/sales/lead-visuals";
import { requireActor } from "@/server/auth-context";
import { getWorkspaceProducts } from "@/server/products";

export const metadata: Metadata = { title: "Home" };

function greeting(timezone: string): string {
  let hour = new Date().getUTCHours();
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: timezone,
      }).format(new Date()),
    );
  } catch {
    // Unknown timezone: fall back to UTC.
  }
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function today(timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: timezone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-US", opts).format(new Date());
  }
}

function UsageCell({ metric }: { metric: AgentUsageMetric }) {
  const pct = metric.limit ? Math.min(100, Math.round((metric.value / metric.limit) * 100)) : null;
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p className="mt-1.5 flex items-baseline gap-1 tabular-nums">
        <span className="text-xl leading-none font-semibold">
          {metric.value.toLocaleString("en")}
        </span>
        {metric.limit !== null ? (
          <span className="text-xs text-muted-foreground">
            / {metric.limit.toLocaleString("en")}
          </span>
        ) : null}
      </p>
      {pct !== null ? (
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={metric.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className={cn("h-full rounded-full", pct >= 90 ? "bg-warning" : "bg-primary")}
            style={{ width: `${Math.max(pct, 1.5)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default async function HomePage() {
  const actor = await requireActor();
  const [company, products] = await Promise.all([
    db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: { name: true, timezone: true },
    }),
    getWorkspaceProducts(actor.companyId),
  ]);
  const hired = products.filter((p) => p.status !== null);
  const usage = Object.fromEntries(
    await Promise.all(
      hired.map(
        async (p) =>
          [
            p.product.key,
            (await getAgentDefinition(p.product.key)?.getUsage(actor.companyId, p)) ?? [],
          ] as const,
      ),
    ),
  );
  const available = products.filter((p) => p.status === null);
  const prices = Object.fromEntries(
    await Promise.all(
      available
        .filter((p) => p.product.availability === "available")
        .map(
          async (p) =>
            [
              p.product.key,
              startingPrice(
                (await listProductPlans(p.product.key)).map((plan) => plan.priceMonthlyCents),
              ),
            ] as const,
        ),
    ),
  );

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={<Eyebrow>{today(company.timezone)}</Eyebrow>}
        title={`${greeting(company.timezone)}, ${company.name}`}
        description={
          hired.length > 0
            ? "Here's your AI workforce."
            : "Hire your first AI employee to get started."
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/marketplace">
              <Store /> AI Marketplace
            </Link>
          </Button>
        }
      />

      <section aria-labelledby="workforce" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="workforce" className="text-[15px] font-semibold">
            Your AI employees
          </h2>
          {hired.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {hired.filter((p) => p.active).length} of {hired.length} on duty
            </p>
          ) : null}
        </div>
        {hired.length === 0 ? (
          <EmptyState
            icon={Store}
            title="You haven't hired any AI employees yet"
            description="Each AI employee is subscribed separately and comes with a free trial."
            action={{ label: "Explore AI employees", href: "/marketplace" }}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {hired.map((p) => (
              <article
                key={p.product.key}
                className="flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/20"
              >
                <div className="flex items-start gap-4 p-5">
                  <ProductIcon name={p.product.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{p.product.name}</h3>
                      <SubscriptionStatusBadge status={p.status} trialDaysLeft={p.trialDaysLeft} />
                    </div>
                    <p className="text-sm text-muted-foreground">{p.product.tagline}</p>
                  </div>
                  {p.active ? (
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <span className="relative flex size-2" aria-hidden="true">
                        <span className="absolute inset-0 animate-ping rounded-full bg-success/50" />
                        <span className="relative size-2 rounded-full bg-success" />
                      </span>
                      On duty
                    </span>
                  ) : null}
                </div>
                {(usage[p.product.key] ?? []).length > 0 ? (
                  <div className="grid gap-px border-t bg-border sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
                    {(usage[p.product.key] ?? []).map((m) => (
                      <UsageCell key={m.key} metric={m} />
                    ))}
                  </div>
                ) : null}
                <div className="mt-auto flex justify-end gap-2 border-t px-5 py-3">
                  {!p.active ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/marketplace/${p.product.key}`}>View plans</Link>
                    </Button>
                  ) : null}
                  {p.product.appPath ? (
                    <Button asChild size="sm">
                      <Link href={p.product.appPath}>
                        Open <ArrowRight />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {available.length > 0 ? (
        <section aria-labelledby="hire" className="space-y-4">
          <div>
            <h2 id="hire" className="text-[15px] font-semibold">
              Hire more AI employees
            </h2>
            <p className="text-sm text-muted-foreground">Add specialists as your business grows.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {available.map((p) => (
              <ProductCard
                key={p.product.key}
                product={p.product}
                price={prices[p.product.key] ?? null}
                href={`/marketplace/${p.product.key}`}
                cta="Explore"
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
