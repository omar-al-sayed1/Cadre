import { can, getJob } from "@repo/core";
import { EmptyState } from "@/components/common";
import { JobForm, type JobFormValues } from "@/components/jobs/job-form";
import { requireActor } from "@/server/auth-context";
import { Lock } from "lucide-react";

export default async function JobSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  if (!can(actor, "job.write"))
    return <EmptyState icon={Lock} title="View only" description="Your role can't edit jobs." />;
  const job = await getJob(actor, id);
  const initial: JobFormValues = {
    title: job.title,
    department: job.department ?? "",
    location: job.location ?? "",
    employmentType: job.employmentType,
    workMode: job.workMode,
    experienceLevel: job.experienceLevel,
    minExperienceYears: job.minExperienceYears?.toString() ?? "",
    maxExperienceYears: job.maxExperienceYears?.toString() ?? "",
    description: job.description,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    preferredQualifications: job.preferredQualifications,
    status: job.status,
    skills: job.skills.map((s) => ({
      key: s.id,
      skillId: s.skillId,
      name: s.skill.name,
      weight: s.weight,
      expectedLevel: s.expectedLevel,
      isCritical: s.isCritical,
    })),
  };
  return (
    <div className="mx-auto max-w-3xl">
      <JobForm initial={initial} jobId={job.id} />
    </div>
  );
}
