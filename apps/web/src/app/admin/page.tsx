import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ChevronLeft } from "lucide-react";
import {
  adminListCompanies,
  adminListFeatureFlags,
  adminListJobs,
  adminListUsers,
  adminOverview,
  adminUsageByCompany,
  listProductPlans,
} from "@repo/core";
import { listProducts } from "@repo/config";
import { Badge } from "@repo/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { BrandLogo, ThemeToggle } from "@/components/brand";
import { MetricCard } from "@/components/common";
import { formatDate, formatRelative, humanize } from "@/lib/format";
import { requireUser } from "@/server/auth-context";
import { FlagControls, RetryJobButton, SubscriptionSelect } from "./admin-client";

export const metadata: Metadata = { title: "Platform admin" };
export const dynamic = "force-dynamic";

/**
 * SUPER_ADMIN console (spec §77). Aggregates only: admins don't get a shortcut
 * into companies' candidate interviews from here.
 */
export default async function AdminPage() {
  const user = await requireUser();
  if (user.platformRole !== "SUPER_ADMIN") notFound();
  const actor = { userId: user.id, platformRole: user.platformRole };
  const [overview, companies, users, usage, flags, failedJobs] = await Promise.all([
    adminOverview(actor),
    adminListCompanies(actor),
    adminListUsers(actor),
    adminUsageByCompany(actor),
    adminListFeatureFlags(actor),
    adminListJobs(actor, "FAILED"),
  ]);
  const catalog = await Promise.all(
    listProducts()
      .filter((product) => product.availability === "available")
      .map(async (product) => ({ product, plans: await listProductPlans(product.key) })),
  );
  const h = overview.health;
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b px-5">
        <div className="flex items-center gap-4">
          <BrandLogo href="/admin" />
          <Badge variant="warning">Platform admin</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/home"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> App
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Companies" value={overview.totals.companies} />
          <MetricCard label="Users" value={overview.totals.users} />
          <MetricCard label="Interviews this month" value={overview.totals.sessionsThisMonth} />
          <MetricCard
            label="AI cost this month"
            value={`$${overview.totals.aiCostThisMonthUsd.toFixed(2)}`}
            hint={`${overview.totals.inputTokens.toLocaleString()} in / ${overview.totals.outputTokens.toLocaleString()} out tokens`}
          />
        </div>
        <Tabs defaultValue="health">
          <TabsList className="scrollbar-none flex w-full justify-start overflow-x-auto sm:w-fit">
            <TabsTrigger value="health">System health</TabsTrigger>
            <TabsTrigger value="companies">Companies</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="usage">AI usage</TabsTrigger>
            <TabsTrigger value="flags">Feature flags</TabsTrigger>
            <TabsTrigger value="jobs">Failed jobs ({failedJobs.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="health">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-4" /> Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  {[
                    ["Database", h.database],
                    [
                      "Queue",
                      Object.entries(h.queue)
                        .map(([k, v]) => `${humanize(k)}: ${v}`)
                        .join(", ") || "empty",
                    ],
                    ["Failed jobs", String(h.failedJobs)],
                    ["AI error rate (24h)", `${h.aiErrorRate24h}%`],
                    ["AI avg latency (24h)", `${h.aiAvgLatencyMs24h} ms`],
                    ["Demo mode", h.demoMode ? "On" : "Off"],
                    ["AI provider", h.aiProvider],
                    ["Speech", `STT ${h.sttProvider} · TTS ${h.ttsProvider}`],
                    ["Storage / email", `${h.storageProvider} · ${h.emailProvider}`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border p-3">
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="companies">
            <Card>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Company</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Jobs</TableHead>
                      <TableHead>Interviews (month)</TableHead>
                      <TableHead>AI cost (month)</TableHead>
                      <TableHead className="pr-5">Subscriptions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="pl-5 font-medium">
                          {c.name}
                          <div className="text-xs font-normal text-muted-foreground">
                            Created {formatDate(c.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">{c._count.members}</TableCell>
                        <TableCell className="tabular-nums">{c._count.jobs}</TableCell>
                        <TableCell className="tabular-nums">
                          {c.usage.interviewsThisMonth}
                          {c.usage.interviewLimit ? ` / ${c.usage.interviewLimit}` : ""}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          ${c.usage.aiCostThisMonthUsd.toFixed(2)}
                        </TableCell>
                        <TableCell className="pr-5">
                          <div className="flex flex-col gap-1.5">
                            {catalog.map(({ product, plans }) => {
                              const sub = c.subscriptions.find((s) => s.productKey === product.key);
                              return (
                                <div key={product.key} className="flex items-center gap-2">
                                  <span className="w-28 text-xs text-muted-foreground">
                                    {product.name}
                                  </span>
                                  <SubscriptionSelect
                                    companyId={c.id}
                                    productKey={product.key}
                                    productName={product.name}
                                    status={sub?.status ?? null}
                                    planKey={sub?.plan?.key ?? null}
                                    plans={plans.map((pl) => ({ key: pl.key, name: pl.name }))}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="users">
            <Card>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">User</TableHead>
                      <TableHead>Companies</TableHead>
                      <TableHead>Verified</TableHead>
                      <TableHead className="pr-5">Last login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="pl-5">
                          <span className="font-medium">{u.name}</span>{" "}
                          {u.platformRole === "SUPER_ADMIN" ? (
                            <Badge variant="warning">Super admin</Badge>
                          ) : null}
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {u.memberships
                            .map((m) => `${m.company.name} (${humanize(m.role)})`)
                            .join(", ") || "—"}
                        </TableCell>
                        <TableCell>{u.emailVerified ? "Yes" : "No"}</TableCell>
                        <TableCell className="pr-5 text-sm text-muted-foreground">
                          {u.lastLoginAt ? formatRelative(u.lastLoginAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="usage">
            <Card>
              <CardHeader>
                <CardTitle>AI usage this month</CardTitle>
                <CardDescription>
                  Estimated from list prices; tokens and speech minutes are exact.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Company</TableHead>
                      <TableHead>Operation</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Tokens (in/out)</TableHead>
                      <TableHead className="pr-5">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usage.map((u, i) => (
                      <TableRow key={i}>
                        <TableCell className="pl-5">{u.company}</TableCell>
                        <TableCell>{humanize(u.operation)}</TableCell>
                        <TableCell className="tabular-nums">{u.calls}</TableCell>
                        <TableCell className="tabular-nums">
                          {u.inputTokens.toLocaleString()} / {u.outputTokens.toLocaleString()}
                        </TableCell>
                        <TableCell className="pr-5 tabular-nums">${u.costUsd.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="flags">
            <Card>
              <CardHeader>
                <CardTitle>Feature flags</CardTitle>
                <CardDescription>
                  Global toggles with percentage rollout. Company overrides take precedence.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {flags.map((f) => (
                    <li
                      key={f.key}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-mono text-sm">{f.key}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.description}
                          {f.overrides.length ? ` · ${f.overrides.length} override(s)` : ""}
                        </p>
                      </div>
                      <FlagControls
                        flagKey={f.key}
                        enabled={f.enabled}
                        rollout={f.rolloutPercentage}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="jobs">
            <Card>
              <CardContent className="px-0">
                {failedJobs.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No failed jobs.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">Job</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead className="pr-5" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedJobs.map((j) => (
                        <TableRow key={j.id}>
                          <TableCell className="pl-5 font-mono text-xs">
                            {j.name}
                            <div className="text-muted-foreground">
                              {formatRelative(j.updatedAt)}
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {j.attempts}/{j.maxAttempts}
                          </TableCell>
                          <TableCell
                            className="max-w-md truncate text-xs text-muted-foreground"
                            title={j.lastError ?? ""}
                          >
                            {j.lastError}
                          </TableCell>
                          <TableCell className="pr-5 text-right">
                            <RetryJobButton jobId={j.id} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
