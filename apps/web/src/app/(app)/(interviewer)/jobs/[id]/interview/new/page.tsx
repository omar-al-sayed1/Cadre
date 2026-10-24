import { getJob, requirePermission } from "@repo/core";
import { TemplateBuilder } from "@/components/builder/template-builder";
import { requireActor } from "@/server/auth-context";

export default async function NewInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  requirePermission(actor, "template.write");
  const job = await getJob(actor, id);
  return (
    <TemplateBuilder
      jobId={job.id}
      jobTitle={job.title}
      skills={job.skills.map((s) => ({ id: s.skillId, name: s.skill.name, weight: s.weight }))}
    />
  );
}
