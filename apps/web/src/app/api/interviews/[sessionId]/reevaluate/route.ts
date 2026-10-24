import { rateLimit, requestReevaluation } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route<{ sessionId: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  await rateLimit("aiGeneration", actor.companyId);
  await requestReevaluation(actor, params.sessionId);
  return { ok: true };
});
