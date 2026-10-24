import { rateApplication } from "@repo/core";
import { manualRatingSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, manualRatingSchema);
  await rateApplication(actor, params.id, input);
  return { ok: true };
});
