import { overrideEvaluation } from "@repo/core";
import { overrideEvaluationSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Human override of the AI score/recommendation (audited, spec §57). */
export const POST = route<{ sessionId: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, overrideEvaluationSchema);
  const evaluation = await overrideEvaluation(actor, params.sessionId, input);
  return {
    evaluation: {
      id: evaluation.id,
      overriddenScore: evaluation.overriddenScore,
      overriddenRecommendation: evaluation.overriddenRecommendation,
    },
  };
});
