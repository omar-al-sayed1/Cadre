import { z } from "zod";
import { listNotifications, markNotificationsRead } from "@repo/core";
import { idSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async () => {
  const actor = await getApiActor();
  return listNotifications(actor.userId, actor.companyId);
});

/** Mark notifications as read (all when no ids are given). */
export const POST = route(async (req) => {
  const actor = await getApiActor();
  const { ids } = await parseBody(req, z.object({ ids: z.array(idSchema).max(100).optional() }));
  await markNotificationsRead(actor.userId, ids);
  return { ok: true };
});
