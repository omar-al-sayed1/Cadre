import { createJob, listJobs } from "@repo/core";
import { createJobSchema } from "@repo/validation";
import { parseBody, route, searchParams } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async (req) => {
  const actor = await getApiActor();
  return listJobs(actor, searchParams(req));
});

export const POST = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, createJobSchema);
  const job = await createJob(actor, input);
  return { job };
});
