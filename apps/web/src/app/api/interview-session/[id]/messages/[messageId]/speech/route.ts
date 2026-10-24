import { synthesizeAiMessage } from "@repo/core";
import { route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

export const maxDuration = 60;

/** Stream synthesized speech for an interviewer message (playback can start before synthesis finishes). */
export const GET = route<{ id: string; messageId: string }>(async (req, { params }) => {
  await limitCandidate(req, "candidateTts", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  const audio = await synthesizeAiMessage(loaded, params.messageId);
  return new Response(audio.stream, {
    headers: {
      "content-type": audio.mimeType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});
