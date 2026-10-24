import { z } from "zod";
import { adminSetSubscription } from "@repo/core";
import { SUBSCRIPTION_STATUSES } from "@repo/shared";
import { parseBody, route } from "@/server/api";
import { getApiUser } from "@/server/auth-context";

const schema = z.object({
  productKey: z.string().min(1).max(40),
  status: z.enum(SUBSCRIPTION_STATUSES),
  planKey: z.string().min(1).max(60).optional(),
});

/** Platform admin: set a company's subscription to a product (manual billing). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await getApiUser();
  const input = await parseBody(req, schema);
  await adminSetSubscription(
    { userId: user.id, platformRole: user.platformRole },
    params.id,
    input,
  );
  return { ok: true };
});
