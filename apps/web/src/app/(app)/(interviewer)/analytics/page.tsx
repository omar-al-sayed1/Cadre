import type { Metadata } from "next";
import Link from "next/link";
import { getCompanyAnalytics } from "@repo/core";
import { RECOMMENDATION_META } from "@repo/scoring";
import type { Recommendation } from "@repo/shared";
import { cn } from "@repo/ui/cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { RecommendationBadge } from "@/components/badges";
import { ColumnChart, HorizontalBarChart } from "@/components/charts";
import { MetricCard, PageHeader } from "@/components/common";
import { COMPLETION_REASON_LABELS } from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [30, 90, 365] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const days = RANGES.find((d) => String(d) === params.days) ?? 90;
  const a = await getCompanyAnalytics(actor, { days });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Aggregate interview metrics. No demographic data is collected or profiled."
        actions={
          <nav aria-label="Date range" className="flex gap-1 rounded-lg border bg-muted/40 p-1">
            {RANGES.map((d) => (
              <Link
                key={d}
                href={`/analytics?days=${d}`}
                aria-current={d === days ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm",
                  d === days ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                )}
              >
                {d === 365 ? "12 months" : `${d} days`}
              </Link>
            ))}
          </nav>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Invitations sent" value={a.invitationsSent} />
        <MetricCard
          label="Completion rate"
          value={a.completionRate === null ? "—" : `${a.completionRate}%`}
          hint={`${a.interviewsCompleted} completed`}
        />
        <MetricCard
          label="No-show rate"
          value={a.noShowRate === null ? "—" : `${a.noShowRate}%`}
          hint="Invitations that expired unused"
        />
        <MetricCard
          label="Average score"
          value={a.averageScore ?? "—"}
          hint={
            a.averageDurationMinutes ? `Avg. duration ${a.averageDurationMinutes} min` : undefined
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
            <CardDescription>Number of evaluated interviews per score band</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              data={a.scoreDistribution.map((b) => ({ label: b.range, value: b.count }))}
              caption="Score distribution"
              height={220}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average score by skill</CardTitle>
            <CardDescription>0–100, across all jobs</CardDescription>
          </CardHeader>
          <CardContent>
            {a.skillAverages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No evaluated interviews yet.
              </p>
            ) : (
              <HorizontalBarChart
                data={a.skillAverages.map((s) => ({ label: s.skill, value: s.average }))}
                caption="Average score by skill"
                unit="/100"
              />
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(a.recommendations).length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              (Object.entries(a.recommendations) as Array<[Recommendation, number]>).map(
                ([rec, count]) => (
                  <div key={rec} className="flex items-center justify-between">
                    <RecommendationBadge value={rec} />
                    <span
                      className="text-sm tabular-nums"
                      aria-label={`${RECOMMENDATION_META[rec].label}: ${count}`}
                    >
                      {count}
                    </span>
                  </div>
                ),
              )
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Drop-off points</CardTitle>
            <CardDescription>Where unfinished interviews stopped</CardDescription>
          </CardHeader>
          <CardContent>
            {a.dropOff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drop-offs recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {a.dropOff.map((d) => (
                  <li key={d.section} className="flex justify-between gap-2">
                    <span>{d.section}</span>
                    <span className="text-muted-foreground tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
              {a.completionReasons.map((r) => (
                <p key={r.reason} className="flex justify-between">
                  <span>
                    {COMPLETION_REASON_LABELS[r.reason as keyof typeof COMPLETION_REASON_LABELS] ??
                      r.reason}
                  </span>
                  <span className="tabular-nums">{r.count}</span>
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Candidate experience</CardTitle>
            <CardDescription>Optional post-interview survey (never affects scores)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {a.candidateExperience.averageRating ?? "—"}
              <span className="text-base text-muted-foreground"> / 5</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {a.candidateExperience.responses} responses
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Candidates per job</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Job</TableHead>
                <TableHead className="pr-5 text-right">Candidates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.candidatesPerJob.map((j) => (
                <TableRow key={j.jobId}>
                  <TableCell className="pl-5">
                    <Link href={`/jobs/${j.jobId}/analytics`} className="hover:underline">
                      {j.title}
                    </Link>
                  </TableCell>
                  <TableCell className="pr-5 text-right tabular-nums">{j.candidates}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
