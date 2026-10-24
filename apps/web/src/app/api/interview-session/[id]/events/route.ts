import { recordIntegrityEvents } from "@repo/core";
import { integrityEventsSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

export const POST = route<{ id: string }>(async (req, { params }) => {
  await limitCandidate(req, "candidateEvents", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  const input = await parseBody(req, integrityEventsSchema);
  await recordIntegrityEvents(loaded, input);
  return { ok: true };
});
