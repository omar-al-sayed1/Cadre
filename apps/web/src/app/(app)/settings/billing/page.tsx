import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { getAgentDefinition, getCompanyUsage } from "@repo/core";
import { db } from "@repo/database";
import { startOfMonthUtc } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Progress } from "@repo/ui/misc";
import { EmptyState } from "@/components/common";
import { SubscriptionStatusBadge } from "@/components/marketplace/product-card";
import { ProductIcon } from "@/components/product-icon";
import { formatDate } from "@/lib/format";
import { requireActor } from "@/server/auth-context";
import { getWorkspaceProducts } from "@/server/products";

const AGENT_LABELS: Record<string, string> = {
  INTERVIEWER: "AI Interviewer",
  SALES: "AI Sales Agent",
};

export default async function SubscriptionsSettingsPage() {
  const actor = await requireActor();
  const since = startOfMonthUtc();
  const [products, usage, byAgent] = await Promise.all([
    getWorkspaceProducts(actor.companyId),
    getCompanyUsage(actor.companyId),
    db.aiUsageEvent.groupBy({
      by: ["agentType"],
      where: { companyId: actor.companyId, createdAt: { gte: since } },
      _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
  ]);
  const subscribed = products.filter((p) => p.status !== null);
  const metrics = Object.fromEntries(
    await Promise.all(
      subscribed.map(
        async (p) =>
          [
            p.product.key,
            (await getAgentDefinition(p.product.key)?.getUsage(actor.companyId, p)) ?? [],
          ] as const,
      ),
    ),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>
              Each AI employee is subscribed separately. Usage resets on the first day of each
              month.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/marketplace">
              <Store /> AI Marketplace
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {subscribed.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No AI employees yet"
              description="Start a free trial from the AI Marketplace."
              action={{ label: "Explore AI employees", href: "/marketplace" }}
            />
          ) : (
            <ul className="divide-y">
              {subscribed.map((p) => (
                <li
                  key={p.product.key}
                  className="grid gap-4 py-5 first:pt-0 last:pb-0 md:grid-cols-[1fr_1.2fr_auto] md:items-center"
                >
                  <div className="flex items-center gap-3">
                    <ProductIcon name={p.product.icon} size="sm" />
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {p.product.name}{" "}
                        <SubscriptionStatusBadge
                          status={p.status}
                          trialDaysLeft={p.trialDaysLeft}
                        />
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {p.plan?.name ?? "No plan"} plan
                        {p.status === "TRIALING" && p.trialEndsAt
                          ? ` · trial ends ${formatDate(p.trialEndsAt)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(metrics[p.product.key] ?? []).map((m) => (
                      <div key={m.key} className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{m.label}</span>
                          <span className="tabular-nums">
                            {m.value.toLocaleString("en")}
                            {m.limit !== null
                              ? ` / ${m.limit.toLocaleString("en")}`
                              : " (unlimited)"}
                          </span>
                        </div>
                        {m.limit ? (
                          <Progress
                            value={Math.min(100, (m.value / m.limit) * 100)}
                            aria-label={m.label}
                            className="h-1.5"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/marketplace/${p.product.key}`}>
                      Manage <ArrowRight />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI usage this month</CardTitle>
          <CardDescription>
            Estimated model and speech costs, tracked per AI employee for billing transparency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Estimated AI cost", `$${usage.aiCostThisMonthUsd.toFixed(2)}`],
              ["Input tokens", usage.inputTokens.toLocaleString("en")],
              ["Output tokens", usage.outputTokens.toLocaleString("en")],
              [
                "Speech",
                `${Math.round(usage.sttSeconds / 60)} min in · ${usage.ttsCharacters.toLocaleString("en")} chars out`,
              ],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {byAgent.length > 0 ? (
            <table className="w-full text-sm">
              <caption className="sr-only">AI usage by AI employee</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">AI employee</th>
                  <th className="py-1 font-medium">Operations</th>
                  <th className="py-1 font-medium">Tokens</th>
                  <th className="py-1 text-right font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byAgent.map((row) => (
                  <tr key={row.agentType ?? "legacy"}>
                    <td className="py-2">
                      {row.agentType
                        ? (AGENT_LABELS[row.agentType] ?? row.agentType)
                        : "AI Interviewer"}
                    </td>
                    <td className="py-2 tabular-nums">{row._count._all.toLocaleString("en")}</td>
                    <td className="py-2 tabular-nums">
                      {((row._sum.inputTokens ?? 0) + (row._sum.outputTokens ?? 0)).toLocaleString(
                        "en",
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      ${(row._sum.estimatedCostUsd ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No AI usage recorded this month.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
