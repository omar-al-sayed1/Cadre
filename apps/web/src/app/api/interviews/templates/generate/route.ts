import { generateTemplateDraft } from "@repo/core";
import { generateTemplateSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const maxDuration = 300;

/** "Generate Interview with AI": returns an editable draft; nothing is saved yet. */
export const POST = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, generateTemplateSchema);
  return { document: await generateTemplateDraft(actor, input) };
});
