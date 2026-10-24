import { startProductTrial } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Start a free trial of an AI employee (once per product per workspace). */
export const POST = route<{ key: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  return { access: await startProductTrial(actor, params.key) };
});
