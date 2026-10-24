import { listSalesActivity } from "@repo/core";
import { route, searchParams } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async (req) => {
  const actor = await getApiActor();
  const params = searchParams(req);
  const before = params.before ? new Date(params.before) : undefined;
  return {
    activity: await listSalesActivity(actor, {
      leadId: params.leadId || undefined,
      limit: Number(params.limit) || 30,
      before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    }),
  };
});
