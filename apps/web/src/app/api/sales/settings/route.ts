import { z } from "zod";
import { getSalesAgent, updateSalesConfig } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async () => {
  const actor = await getApiActor();
  return { agent: await getSalesAgent(actor) };
});

/** Save one configuration section: { section, data, completeOnboarding? }. */
export const PUT = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown(), 200_000);
  return { agent: await updateSalesConfig(actor, input) };
});
