import { getTemplate } from "@repo/core";
import { TemplateBuilder } from "@/components/builder/template-builder";
import { requireActor } from "@/server/auth-context";

export default async function EditInterviewPage({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { templateId } = await params;
  const actor = await requireActor();
  const { template, document } = await getTemplate(actor, templateId);
  return (
    <TemplateBuilder
      jobId={template.jobId}
      jobTitle={template.job.title}
      skills={template.job.skills.map((s) => ({
        id: s.skillId,
        name: s.skill.name,
        weight: s.weight,
      }))}
      templateId={template.id}
      initial={document}
      generatedByAi={template.generatedByAi}
      publishedVersion={template.publishedVersion}
      hasUnpublishedChanges={template.hasUnpublishedChanges}
    />
  );
}
