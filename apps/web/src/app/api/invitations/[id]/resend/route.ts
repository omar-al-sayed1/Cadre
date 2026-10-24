import { z } from "zod";
import { rateLimit, resendInvitation } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  await rateLimit("inviteSend", actor.companyId);
  const input = await parseBody(
    req,
    z.object({
      sendEmail: z.boolean().default(true),
      extendDays: z.number().int().min(1).max(60).optional(),
    }),
  );
  const { invitation, url } = await resendInvitation(actor, params.id, input);
  return {
    invitation: { id: invitation.id, status: invitation.status, expiresAt: invitation.expiresAt },
    url,
  };
});
