import { submitCandidateMessage } from "@repo/core";
import { candidateMessageSchema, idSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

export const maxDuration = 90;

/** Submit an answer; idempotent per clientMessageId (safe to retry after a network drop). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  await limitCandidate(req, "candidateMessage", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  const input = await parseBody(
    req,
    candidateMessageSchema.extend({ recordingId: idSchema.optional() }),
    64_000,
  );
  return submitCandidateMessage(loaded, input);
});
