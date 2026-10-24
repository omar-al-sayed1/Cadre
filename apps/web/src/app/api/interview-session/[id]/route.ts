import { getCandidateSessionView } from "@repo/core";
import { route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

/** Candidate-safe interview state (no scores, rubrics or internal reasoning). */
export const GET = route<{ id: string }>(async (req, { params }) => {
  await limitCandidate(req, "publicApi", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  return { session: await getCandidateSessionView(loaded) };
});
