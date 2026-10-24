import { z } from "zod";
import { generateOutreachDraft } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** AI outreach draft, stored for review. Nothing is sent. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown(), 10_000);
  return { message: await generateOutreachDraft(actor, params.id, input) };
});
