import { LIMITS } from "@repo/config";
import { rateLimit, uploadResume } from "@repo/core";
import { readUpload, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Upload a PDF/DOCX resume (validated by magic bytes, 10 MB max, parsed in the background). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  await rateLimit("fileUpload", actor.userId);
  const { bytes, filename } = await readUpload(req, "file", LIMITS.resume.maxBytes);
  const resume = await uploadResume(actor, params.id, bytes, filename);
  return {
    resume: { id: resume.id, parseStatus: resume.parseStatus, filename: resume.originalFilename },
  };
});
