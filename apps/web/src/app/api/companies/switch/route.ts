import { z } from "zod";
import { switchActiveCompany } from "@repo/core";
import { idSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiUser } from "@/server/auth-context";

export const POST = route(async (req) => {
  const user = await getApiUser();
  const { companyId } = await parseBody(req, z.object({ companyId: idSchema }));
  await switchActiveCompany(user.id, companyId);
  return { ok: true };
});
