import { LIMITS } from "@repo/config";
import { importCandidatesCsv, rateLimit } from "@repo/core";
import { AppError } from "@repo/shared";
import { idSchema } from "@repo/validation";
import { readUpload, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Bulk candidate import from CSV (first_name,last_name,email,phone,linkedin,location). */
export const POST = route(async (req) => {
  const actor = await getApiActor();
  await rateLimit("fileUpload", actor.userId);
  const jobIdParam = req.nextUrl.searchParams.get("jobId");
  const jobId = jobIdParam ? idSchema.parse(jobIdParam) : undefined;
  const { bytes, filename } = await readUpload(req, "file", LIMITS.candidateCsv.maxBytes);
  if (!/\.csv$/i.test(filename))
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", { message: "Upload a .csv file." });
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.includes("\u0000"))
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", {
      message: "This doesn't look like a CSV text file.",
    });
  return importCandidatesCsv(actor, text, jobId);
});
