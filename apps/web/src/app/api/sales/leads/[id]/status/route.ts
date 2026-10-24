import { z } from "zod";
import { changeLeadStatus } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Human status change; the state machine decides what's allowed. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown());
  return { lead: await changeLeadStatus(actor, params.id, input, "USER") };
});
