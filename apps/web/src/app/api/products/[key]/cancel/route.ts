import { cancelProductSubscription } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const POST = route<{ key: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { access: await cancelProductSubscription(actor, params.key) };
});
