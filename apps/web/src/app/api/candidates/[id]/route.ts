import { getCandidate, updateCandidate } from "@repo/core";
import { updateCandidateSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { candidate: await getCandidate(actor, params.id) };
});

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, updateCandidateSchema);
  return { candidate: await updateCandidate(actor, params.id, input) };
});
