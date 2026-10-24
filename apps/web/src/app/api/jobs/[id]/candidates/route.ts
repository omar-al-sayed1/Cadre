import { createCandidate, listCandidates } from "@repo/core";
import { createCandidateSchema } from "@repo/validation";
import { parseBody, route, searchParams } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  return listCandidates(actor, { ...searchParams(req), jobId: params.id });
});

/** Add a candidate directly to this job's pipeline. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, createCandidateSchema.omit({ jobId: true }));
  const candidate = await createCandidate(actor, { ...input, jobId: params.id });
  return { candidate };
});
