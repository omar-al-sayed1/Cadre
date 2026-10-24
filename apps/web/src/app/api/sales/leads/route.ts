import { z } from "zod";
import { createLead, listLeads } from "@repo/core";
import { parseBody, route, searchParams } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async (req) => {
  const actor = await getApiActor();
  return listLeads(actor, searchParams(req));
});

export const POST = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown());
  return { lead: await createLead(actor, input) };
});
