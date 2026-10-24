import { startCandidateSession } from "@repo/core";
import { route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

export const POST = route<{ id: string }>(async (req, { params }) => {
  await limitCandidate(req, "candidateMessage", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  return { session: await startCandidateSession(loaded) };
});
