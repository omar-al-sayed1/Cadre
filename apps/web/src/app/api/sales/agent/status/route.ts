import { z } from "zod";
import { setSalesAgentStatus } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

const schema = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) });

export const POST = route(async (req) => {
  const actor = await getApiActor();
  const { status } = await parseBody(req, schema);
  return { agent: await setSalesAgentStatus(actor, status) };
});
