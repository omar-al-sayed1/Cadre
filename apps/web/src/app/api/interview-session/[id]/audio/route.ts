import { LIMITS } from "@repo/config";
import { transcribeCandidateAudio } from "@repo/core";
import { readUpload, route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

export const maxDuration = 60;

/**
 * Upload one utterance. Transcribed server-side when a server STT provider is
 * configured; stored as a recording only when recording is enabled and consented.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  await limitCandidate(req, "candidateAudio", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  const transcribe = req.nextUrl.searchParams.get("transcribe") !== "false";
  const { bytes } = await readUpload(req, "audio", LIMITS.audio.maxBytes);
  return transcribeCandidateAudio(loaded, bytes, { transcribe });
});
