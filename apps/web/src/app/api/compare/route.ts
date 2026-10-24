import { compareCandidates } from "@repo/core";
import { compareQuerySchema } from "@repo/validation";
import { route, searchParams } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async (req) => {
  const actor = await getApiActor();
  const query = compareQuerySchema.parse(searchParams(req));
  return compareCandidates(actor, query.jobId, query.candidateIds);
});
