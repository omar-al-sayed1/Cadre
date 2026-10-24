import { acceptTeamInvitation } from "@repo/core";
import { acceptTeamInviteSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiUser } from "@/server/auth-context";

export const POST = route(async (req) => {
  const user = await getApiUser();
  const { token } = await parseBody(req, acceptTeamInviteSchema);
  const companyId = await acceptTeamInvitation(user, token);
  return { companyId };
});
