import { z } from "zod";
import { importLeads } from "@repo/core";
import { rateLimit } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** CSV import: preview (commit=false) or insert (commit=true). */
export const POST = route(async (req) => {
  const actor = await getApiActor();
  await rateLimit("fileUpload", actor.userId);
  const input = await parseBody(req, z.unknown(), 6_000_000);
  return importLeads(actor, input);
});
