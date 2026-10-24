import { archiveTemplate, getTemplate, saveTemplateDocument } from "@repo/core";
import { templateDocumentSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  const { template, document } = await getTemplate(actor, params.id);
  return {
    template: {
      id: template.id,
      jobId: template.jobId,
      status: template.status,
      publishedVersion: template.publishedVersion,
    },
    document,
  };
});

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const document = await parseBody(req, templateDocumentSchema, 2_000_000);
  const template = await saveTemplateDocument(actor, params.id, document);
  return { template: { id: template.id, hasUnpublishedChanges: template.hasUnpublishedChanges } };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  await archiveTemplate(actor, params.id);
  return { ok: true };
});
