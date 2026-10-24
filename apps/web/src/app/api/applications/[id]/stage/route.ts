import { updateApplicationStage } from "@repo/core";
import { updateStageSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, updateStageSchema);
  return { application: await updateApplicationStage(actor, params.id, input) };
});
