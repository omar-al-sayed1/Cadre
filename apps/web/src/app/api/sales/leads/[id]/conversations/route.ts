import { z } from "zod";
import { listConversations, logMessage } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { conversations: await listConversations(actor, params.id) };
});

/** Log a message exchanged outside Cadre; inbound replies are analysed. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown(), 100_000);
  return logMessage(actor, params.id, input);
});
