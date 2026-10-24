import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, MapPin, Plus, Users } from "lucide-react";
import { can, listJobs } from "@repo/core";
import { JOB_STATUSES, type JobStatus } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { JobStatusBadge, ScoreBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/common";
import {
  EMPLOYMENT_LABELS,
  EXPERIENCE_LABELS,
  JOB_STATUS_LABELS,
  WORK_MODE_LABELS,
} from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const status = JOB_STATUSES.includes(params.status as JobStatus)
    ? (params.status as JobStatus)
    : undefined;
  const { items } = await listJobs(actor, { status, q: params.q, pageSize: 100 });
  const canWrite = can(actor, "job.write");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Roles you're hiring for and their AI interviews."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/jobs/new">
                <Plus /> New job
              </Link>
            </Button>
          ) : null
        }
      />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        {[undefined, ...JOB_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/jobs?status=${s}` : "/jobs"}
            aria-current={status === s ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              status === s
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s ? JOB_STATUS_LABELS[s] : "All open"}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={status ? "No jobs with this status" : "No jobs yet"}
          description="Create your first role and let AI help build the interview."
          action={canWrite ? { label: "Create Job", href: "/jobs/new" } : undefined}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="group flex h-full flex-col rounded-xl border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold group-hover:text-primary">{job.title}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {[job.department, EXPERIENCE_LABELS[job.experienceLevel]]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <JobStatusBadge status={job.status} />
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {[
                    job.location,
                    WORK_MODE_LABELS[job.workMode],
                    EMPLOYMENT_LABELS[job.employmentType],
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {job.skills.slice(0, 5).map((s) => (
                    <span key={s.id} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {s.skill.name}
                    </span>
                  ))}
                  {job.skills.length > 5 ? (
                    <span className="text-xs text-muted-foreground">+{job.skills.length - 5}</span>
                  ) : null}
                </div>
                <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-4 text-sm">
                  <div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" aria-hidden="true" /> Candidates
                    </div>
                    <div className="font-semibold tabular-nums">{job.stats.candidates}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Completed</div>
                    <div className="font-semibold tabular-nums">{job.stats.completed}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Avg. score</div>
                    <ScoreBadge score={job.stats.averageScore} className="mt-0.5" />
                  </div>
                </div>
                {job.templates.length === 0 ? (
                  <p className="mt-3 text-xs text-warning-foreground">No published interview yet</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
