import { createCompany } from "@repo/core";
import { createCompanySchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiUser } from "@/server/auth-context";

/** Onboarding: create a company workspace for the signed-in user. */
export const POST = route(async (req) => {
  const user = await getApiUser();
  const input = await parseBody(req, createCompanySchema);
  const company = await createCompany({ id: user.id, name: user.name }, input);
  return { company: { id: company.id, name: company.name, slug: company.slug } };
});
