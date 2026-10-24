import { getInterviewReport } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ sessionId: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { report: await getInterviewReport(actor, params.sessionId) };
});
