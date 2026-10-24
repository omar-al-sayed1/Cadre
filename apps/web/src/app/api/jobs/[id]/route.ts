import { deleteJob, getJob, updateJob } from "@repo/core";
import { updateJobSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { job: await getJob(actor, params.id) };
});

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, updateJobSchema);
  return { job: await updateJob(actor, params.id, input) };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  await deleteJob(actor, params.id);
  return { ok: true };
});
