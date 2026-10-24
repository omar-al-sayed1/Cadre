import { cancelInvitation } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  await cancelInvitation(actor, params.id);
  return { ok: true };
});
