import { removeMember, updateMemberRole } from "@repo/core";
import { updateMemberRoleSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const PATCH = route<{ userId: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, updateMemberRoleSchema);
  return { member: await updateMemberRole(actor, params.userId, input) };
});

export const DELETE = route<{ userId: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  await removeMember(actor, params.userId);
  return { ok: true };
});
