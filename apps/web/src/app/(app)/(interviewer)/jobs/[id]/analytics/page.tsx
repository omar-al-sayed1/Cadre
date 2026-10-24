import { getCompanyAnalytics } from "@repo/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { ColumnChart, HorizontalBarChart } from "@/components/charts";
import { MetricCard } from "@/components/common";
import { requireActor } from "@/server/auth-context";

export default async function JobAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const a = await getCompanyAnalytics(actor, { jobId: id, days: 365 });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Invitations sent" value={a.invitationsSent} />
        <MetricCard
          label="Completion rate"
          value={a.completionRate === null ? "—" : `${a.completionRate}%`}
        />
        <MetricCard label="Average score" value={a.averageScore ?? "—"} />
        <MetricCard
          label="Avg. duration"
          value={a.averageDurationMinutes === null ? "—" : `${a.averageDurationMinutes} min`}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
            <CardDescription>Completed evaluations for this job</CardDescription>
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
            <CardDescription>0–100</CardDescription>
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
    </div>
  );
}
