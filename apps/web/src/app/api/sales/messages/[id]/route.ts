import { z } from "zod";
import { updateDraft } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Edit, approve or discard a draft. */
export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown(), 100_000);
  return { message: await updateDraft(actor, params.id, input) };
});
