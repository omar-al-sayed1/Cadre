import { updateCompanySettings } from "@repo/core";
import { updateCompanySettingsSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const PATCH = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, updateCompanySettingsSchema);
  return { settings: await updateCompanySettings(actor, input) };
});
