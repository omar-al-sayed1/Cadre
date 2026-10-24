import type { Metadata } from "next";
import { requirePermission } from "@repo/core";
import { PageHeader } from "@/components/common";
import { JobForm } from "@/components/jobs/job-form";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage() {
  const actor = await requireActor();
  requirePermission(actor, "job.write");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Create a job"
        description="Describe the role and the skills you want to assess. Next, AI can generate the interview for you."
      />
      <JobForm />
    </div>
  );
}
