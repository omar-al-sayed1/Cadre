import { createCandidate, listCandidates } from "@repo/core";
import { createCandidateSchema } from "@repo/validation";
import { parseBody, route, searchParams } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async (req) => {
  const actor = await getApiActor();
  return listCandidates(actor, searchParams(req));
});

export const POST = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, createCandidateSchema);
  return { candidate: await createCandidate(actor, input) };
});
