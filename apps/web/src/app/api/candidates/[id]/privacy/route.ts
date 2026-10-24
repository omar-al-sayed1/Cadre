import { requestCandidateDeletion } from "@repo/core";
import { privacyDeletionSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Privacy request: delete selected categories of a candidate's data (processed in the background). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, privacyDeletionSchema);
  const request = await requestCandidateDeletion(actor, params.id, input);
  return { request: { id: request.id, status: request.status } };
});
