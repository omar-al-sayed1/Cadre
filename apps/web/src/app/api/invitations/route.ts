import { createInvitation, rateLimit } from "@repo/core";
import { createInvitationSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route(async (req) => {
  const actor = await getApiActor();
  await rateLimit("inviteSend", actor.companyId);
  const input = await parseBody(req, createInvitationSchema);
  const { invitation, candidate, url } = await createInvitation(actor, input);
  return {
    invitation: { id: invitation.id, status: invitation.status, expiresAt: invitation.expiresAt },
    candidate: { id: candidate.id },
    url,
  };
});
