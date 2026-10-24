import { markDraftSent } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** The user sent this draft themselves, outside Cadre. */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { message: await markDraftSent(actor, params.id) };
});
