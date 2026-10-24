import { getCompany, updateCompany } from "@repo/core";
import { updateCompanySchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async () => {
  const actor = await getApiActor();
  return { company: await getCompany(actor) };
});

export const PATCH = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, updateCompanySchema);
  return { company: await updateCompany(actor, input) };
});
