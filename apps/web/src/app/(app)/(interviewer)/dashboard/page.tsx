import type { Metadata } from "next";
import Link from "next/link";
import {
  Briefcase,
  CalendarCheck,
  ClipboardCheck,
  Inbox,
  MessagesSquare,
  Plus,
} from "lucide-react";
import { can, getDashboard } from "@repo/core";
import { db } from "@repo/database";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { RecommendationBadge, ScoreBadge } from "@/components/badges";
import { ColumnChart, HorizontalBarChart, TrendLineChart } from "@/components/charts";
import { EmptyState, MetricCard, PageHeader } from "@/components/common";
import { formatDate, formatRelative, SESSION_STATUS_LABELS, STAGE_LABELS } from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Dashboard" };

const PIPELINE_STAGES = [
  "INVITED",
  "OPENED",
  "STARTED",
  "COMPLETED",
  "UNDER_REVIEW",
  "SHORTLISTED",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const;

export default async function DashboardPage() {
  const actor = await requireActor();
  const canAnalytics = can(actor, "analytics.read");
  const [data, jobCount] = await Promise.all([
    canAnalytics ? getDashboard(actor) : null,
    db.job.count({ where: { companyId: actor.companyId, deletedAt: null } }),
  ]);

  if (jobCount === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Welcome, ${actor.userName.split(" ")[0]}`}
          description="Your AI interview workspace is ready."
        />
        <EmptyState
          icon={Briefcase}
          title="Create your first role"
          description="Create your first role and let AI help build the interview."
          action={can(actor, "job.write") ? { label: "Create Job", href: "/jobs/new" } : undefined}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={MessagesSquare}
          title="Interviews to review"
          description="Open the interviews list to review candidates."
          action={{ label: "View interviews", href: "/interviews" }}
        />
      </div>
    );
  }

  const pipeline = PIPELINE_STAGES.map((stage) => ({
    label: STAGE_LABELS[stage],
    value: data.pipeline.find((p) => p.stage === stage)?.count ?? 0,
  }));
  const weekly = data.weekly.map((w) => ({
    label: formatDate(w.week, { month: "short", day: "numeric" }),
    value: w.completed,
  }));
  const weeklyScore = data.weekly.map((w) => ({
    label: formatDate(w.week, { month: "short", day: "numeric" }),
    value: w.averageScore,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="An overview of your hiring pipeline and AI interviews."
        actions={
          can(actor, "job.write") ? (
            <Button asChild>
              <Link href="/jobs/new">
                <Plus /> New job
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active jobs"
          value={data.cards.activeJobs}
          icon={Briefcase}
          href="/jobs"
        />
        <MetricCard
          label="Interviews this week"
          value={data.cards.interviewsThisWeek}
          icon={CalendarCheck}
          href="/interviews"
        />
        <MetricCard
          label="Completed interviews"
          value={data.cards.completedInterviews}
          icon={ClipboardCheck}
          hint={
            data.completionRate !== null
              ? `${data.completionRate}% completion rate (30 days)`
              : undefined
          }
          href="/interviews?status=COMPLETED"
        />
        <MetricCard
          label="Awaiting review"
          value={data.cards.awaitingReview}
          icon={Inbox}
          hint="Completed, not yet decided"
          href="/candidates?stage=COMPLETED"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Candidate pipeline</CardTitle>
            <CardDescription>Candidates by current stage, across all jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart data={pipeline} caption="Candidates by stage" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Average score by skill</CardTitle>
            <CardDescription>Completed evaluations, 0–100</CardDescription>
          </CardHeader>
          <CardContent>
            {data.skillScores.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Scores appear after the first evaluated interview.
              </p>
            ) : (
              <HorizontalBarChart
                data={data.skillScores.map((s) => ({ label: s.skill, value: s.average }))}
                caption="Average score by skill"
                unit="/100"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Completed interviews per week</CardTitle>
            <CardDescription>Last 12 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            {weekly.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No completed interviews yet.
              </p>
            ) : (
              <ColumnChart data={weekly} caption="Completed interviews per week" height={200} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average interview score</CardTitle>
            <CardDescription>
              Weekly average
              {data.averageScore !== null ? ` · ${data.averageScore}/100 over 90 days` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weeklyScore.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No scores yet.</p>
            ) : (
              <TrendLineChart
                data={weeklyScore}
                caption="Average interview score per week"
                unit="/100"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Latest interview sessions</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {data.recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No interviews yet. Invite a candidate from a job page to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="pr-5 text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((r) => (
                  <TableRow key={r.sessionId}>
                    <TableCell className="pl-5 font-medium">
                      <Link href={`/interviews/${r.sessionId}`} className="hover:underline">
                        {r.candidate}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.job}</TableCell>
                    <TableCell>{SESSION_STATUS_LABELS[r.status] ?? r.status}</TableCell>
                    <TableCell>
                      <ScoreBadge score={r.score} />
                    </TableCell>
                    <TableCell>
                      {r.evaluationStatus === "COMPLETED" ? (
                        <RecommendationBadge value={r.recommendation} />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {r.evaluationStatus === "PROCESSING" || r.evaluationStatus === "PENDING"
                            ? "Evaluating…"
                            : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-muted-foreground">
                      {formatRelative(r.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
