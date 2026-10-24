import { inviteMember, rateLimit } from "@repo/core";
import { inviteMemberSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route(async (req) => {
  const actor = await getApiActor();
  await rateLimit("inviteSend", actor.companyId);
  const input = await parseBody(req, inviteMemberSchema);
  const { invitation, url } = await inviteMember(actor, input);
  return { invitation: { id: invitation.id, email: invitation.email, role: invitation.role }, url };
});
