import { getDashboard } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async () => {
  const actor = await getApiActor();
  return getDashboard(actor);
});
