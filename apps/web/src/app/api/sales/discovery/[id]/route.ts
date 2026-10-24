import { getDiscoveryRun } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { run: await getDiscoveryRun(actor, params.id) };
});
