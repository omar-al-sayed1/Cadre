import { getLatestResearch, requestLeadResearch } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { research: await getLatestResearch(actor, params.id) };
});

/** Queue AI research for this lead (runs in the background). */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { research: await requestLeadResearch(actor, params.id) };
});
