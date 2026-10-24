import { z } from "zod";
import { getDiscoveryMode, listDiscoveryRuns, requestDiscovery } from "@repo/core";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async () => {
  const actor = await getApiActor();
  return { mode: getDiscoveryMode(), runs: await listDiscoveryRuns(actor) };
});

/** Start an AI lead discovery run (runs in the background; poll the run for results). */
export const POST = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, z.unknown());
  return { run: await requestDiscovery(actor, input) };
});
