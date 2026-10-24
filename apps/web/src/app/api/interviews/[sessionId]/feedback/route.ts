import { submitEvaluationFeedback } from "@repo/core";
import { evaluationFeedbackSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Recruiter rates the AI assessment's accuracy (spec §126). Stored for evaluation; never auto-trains models. */
export const POST = route<{ sessionId: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, evaluationFeedbackSchema);
  await submitEvaluationFeedback(actor, params.sessionId, input);
  return { ok: true };
});
