import { revokeTeamInvitation } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  await revokeTeamInvitation(actor, params.id);
  return { ok: true };
});
