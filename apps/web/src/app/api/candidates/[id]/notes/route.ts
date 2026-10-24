import { addRecruiterNote } from "@repo/core";
import { recruiterNoteSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, recruiterNoteSchema);
  return { note: await addRecruiterNote(actor, params.id, input) };
});
