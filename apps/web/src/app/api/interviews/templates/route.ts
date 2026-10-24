import { z } from "zod";
import { createTemplate, listTemplates } from "@repo/core";
import { createTemplateSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async (req) => {
  const actor = await getApiActor();
  const jobId = req.nextUrl.searchParams.get("jobId") ?? undefined;
  return { templates: await listTemplates(actor, jobId) };
});

export const POST = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(
    req,
    createTemplateSchema.extend({ generatedByAi: z.boolean().default(false) }),
    2_000_000,
  );
  const template = await createTemplate(actor, input.jobId, input.document, {
    generatedByAi: input.generatedByAi,
  });
  return { template: { id: template.id } };
});
