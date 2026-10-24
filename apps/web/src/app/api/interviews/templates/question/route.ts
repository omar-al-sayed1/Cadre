import { regenerateQuestion } from "@repo/core";
import { regenerateQuestionSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const maxDuration = 120;

export const POST = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, regenerateQuestionSchema);
  return { question: await regenerateQuestion(actor, input) };
});
