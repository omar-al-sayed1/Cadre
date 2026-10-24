import { submitCandidateFeedback } from "@repo/core";
import { candidateFeedbackSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

/** Optional candidate experience feedback. Never affects scoring. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  await limitCandidate(req, "candidateEvents", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  const input = await parseBody(req, candidateFeedbackSchema);
  await submitCandidateFeedback(loaded, input);
  return { ok: true };
});
