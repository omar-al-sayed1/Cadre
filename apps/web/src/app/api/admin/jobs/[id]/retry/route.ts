import { adminRetryJob } from "@repo/core";
import { route } from "@/server/api";
import { getApiUser } from "@/server/auth-context";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const user = await getApiUser();
  await adminRetryJob({ userId: user.id, platformRole: user.platformRole }, params.id);
  return { ok: true };
});
