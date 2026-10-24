import { LIMITS } from "@repo/config";
import { rateLimit, uploadCompanyLogo } from "@repo/core";
import { readUpload, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route(async (req) => {
  const actor = await getApiActor();
  await rateLimit("fileUpload", actor.userId);
  const { bytes } = await readUpload(req, "file", LIMITS.logo.maxBytes);
  await uploadCompanyLogo(actor, bytes);
  return { ok: true };
});
