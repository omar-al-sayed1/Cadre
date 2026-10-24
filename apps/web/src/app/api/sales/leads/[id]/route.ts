import { z } from "zod";
import { deleteLead, getLead, updateLead } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { lead: await getLead(actor, params.id) };
});

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown());
  return { lead: await updateLead(actor, params.id, input) };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  await deleteLead(actor, params.id);
  return { ok: true };
});
