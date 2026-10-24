import { adminAssignPlan } from "@repo/core";
import { assignPlanSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiUser } from "@/server/auth-context";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await getApiUser();
  const input = await parseBody(req, assignPlanSchema);
  await adminAssignPlan({ userId: user.id, platformRole: user.platformRole }, params.id, input);
  return { ok: true };
});
