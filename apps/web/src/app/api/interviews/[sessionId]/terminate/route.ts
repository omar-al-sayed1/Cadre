import { terminateSession } from "@repo/core";
import { terminateSessionSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route<{ sessionId: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const { reason } = await parseBody(req, terminateSessionSchema);
  await terminateSession(actor, params.sessionId, reason);
  return { ok: true };
});
