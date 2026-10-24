import { importBankQuestionsCsv, rateLimit } from "@repo/core";
import { AppError } from "@repo/shared";
import { readUpload, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** CSV columns: question,type,skill,difficulty,expected_answer,weight,tags */
export const POST = route(async (req) => {
  const actor = await getApiActor();
  await rateLimit("fileUpload", actor.userId);
  const { bytes, filename } = await readUpload(req, "file", 2 * 1024 * 1024);
  if (!/\.csv$/i.test(filename))
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", { message: "Upload a .csv file." });
  return importBankQuestionsCsv(actor, new TextDecoder().decode(bytes));
});
