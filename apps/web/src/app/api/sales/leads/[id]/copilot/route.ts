import { z } from "zod";
import { askSalesCopilot, listCopilotHistory } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { history: await listCopilotHistory(actor, params.id) };
});

/** Ask Sales AI about one lead. Advice only — nothing is changed or sent. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown(), 10_000);
  return { exchange: await askSalesCopilot(actor, params.id, input) };
});
