import { heartbeat } from "@repo/core";
import { heartbeatSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { candidateSessionFromRequest, limitCandidate } from "@/server/candidate-auth";

/** Keep-alive: tracks disconnections (paused time isn't counted) and enforces strict time limits. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  await limitCandidate(req, "candidateEvents", params.id);
  const loaded = await candidateSessionFromRequest(params.id);
  const input = await parseBody(req, heartbeatSchema);
  return { session: await heartbeat(loaded, input) };
});
