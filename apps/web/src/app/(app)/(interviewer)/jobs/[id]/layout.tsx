import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getJob } from "@repo/core";
import { JobStatusBadge } from "@/components/badges";
import { PageHeader } from "@/components/common";
import { EMPLOYMENT_LABELS, EXPERIENCE_LABELS, WORK_MODE_LABELS } from "@/lib/format";
import { requireActor } from "@/server/auth-context";
import { JobTabs } from "./job-tabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(await requireActor(), id);
  return { title: job.title };
}

export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const job = await getJob(actor, id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/jobs" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden="true" /> Jobs
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {job.title} <JobStatusBadge status={job.status} />
          </span>
        }
        description={[
          job.department,
          EXPERIENCE_LABELS[job.experienceLevel],
          WORK_MODE_LABELS[job.workMode],
          EMPLOYMENT_LABELS[job.employmentType],
          job.location,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <JobTabs jobId={job.id} />
      {children}
    </div>
  );
}
