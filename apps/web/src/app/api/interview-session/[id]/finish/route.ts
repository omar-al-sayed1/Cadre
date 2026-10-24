import { endInterviewByCandidate } from "@repo/core";
import { finishSessionSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

/** Candidate ends the interview early. Idempotent. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  await limitCandidate(req, "candidateMessage", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  await parseBody(req, finishSessionSchema);
  return { session: await endInterviewByCandidate(loaded) };
});
