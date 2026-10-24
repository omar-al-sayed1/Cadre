import { z } from "zod";
import { addDiscoveredLeads } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Add reviewed companies from a discovery run as leads. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown());
  return addDiscoveredLeads(actor, params.id, input);
});
