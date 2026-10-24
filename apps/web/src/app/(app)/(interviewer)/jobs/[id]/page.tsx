import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardList, Sparkles, Star } from "lucide-react";
import { can, getJob } from "@repo/core";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { ScoreBadge } from "@/components/badges";
import { EmptyState, MetricCard } from "@/components/common";
import { InviteDialog } from "@/components/invite-dialog";
import { humanize, INTERVIEW_TYPE_LABELS } from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export default async function JobOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { id } = await params;
  const { invite } = await searchParams;
  const actor = await requireActor();
  const job = await getJob(actor, id);
  const published = job.templates.filter((t) => t.status === "PUBLISHED");
  const canInvite = can(actor, "invitation.send");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Candidates"
          value={job.stats.candidates}
          href={`/jobs/${job.id}/candidates`}
        />
        <MetricCard label="Invitations" value={job.stats.invited} />
        <MetricCard label="Completed interviews" value={job.stats.completed} />
        <MetricCard
          label="Average score"
          value={<ScoreBadge score={job.stats.averageScore} className="text-2xl" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Interview</CardTitle>
            <CardDescription>
              Candidates are interviewed with the latest published version.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.templates.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No interview yet"
                description="Generate a structured interview from this job's description and skills, then review it before publishing."
                action={
                  can(actor, "template.write")
                    ? { label: "Generate interview with AI", href: `/jobs/${job.id}/interview/new` }
                    : undefined
                }
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {job.templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/jobs/${job.id}/interview/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {INTERVIEW_TYPE_LABELS[t.type]} · {t.durationMinutes} min ·{" "}
                        {t.publishedVersion > 0
                          ? `version ${t.publishedVersion}`
                          : "never published"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.status === "PUBLISHED" ? (
                        <Badge variant="success">Published</Badge>
                      ) : (
                        <Badge variant="outline">{humanize(t.status)}</Badge>
                      )}
                      {t.hasUnpublishedChanges && t.publishedVersion > 0 ? (
                        <Badge variant="warning">
                          <AlertTriangle /> Unpublished changes
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {canInvite ? (
                <InviteDialog
                  templates={published.map((t) => ({
                    id: t.id,
                    name: t.name,
                    durationMinutes: t.durationMinutes,
                  }))}
                  defaultOpen={invite === "1" && published.length > 0}
                />
              ) : null}
              <Button asChild variant="outline">
                <Link href={`/jobs/${job.id}/interview`}>
                  <ClipboardList /> Manage interviews
                </Link>
              </Button>
            </div>
            {canInvite && published.length === 0 && job.templates.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Publish an interview to start inviting candidates.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Skills rubric</CardTitle>
            <CardDescription>
              What the AI evaluates, and how much each skill counts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {job.skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills defined.</p>
            ) : (
              <ul className="space-y-3">
                {job.skills.map((s) => (
                  <li key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 font-medium">
                        {s.skill.name}
                        {s.isCritical ? (
                          <Star
                            className="size-3.5 fill-warning text-warning"
                            aria-label="Critical skill"
                          />
                        ) : null}
                      </span>
                      <span className="text-muted-foreground tabular-nums">{s.weight}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${s.weight}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Expected: {humanize(s.expectedLevel)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {job.description ? (
        <Card>
          <CardHeader>
            <CardTitle>About the role</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 text-sm md:grid-cols-2">
            {[
              ["Summary", job.description],
              ["Responsibilities", job.responsibilities],
              ["Requirements", job.requirements],
              ["Preferred", job.preferredQualifications],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <h3 className="mb-1 font-medium">{label}</h3>
                  <p className="whitespace-pre-line text-muted-foreground">{value}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      ) : null}

      {job.stats.completed > 1 ? (
        <div className="flex justify-end">
          <Button asChild variant="ghost">
            <Link href={`/compare?jobId=${job.id}`}>
              Compare candidates <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
