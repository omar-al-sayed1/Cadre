import { adminUpdateFeatureFlag } from "@repo/core";
import { featureFlagUpdateSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiUser } from "@/server/auth-context";

export const PATCH = route<{ key: string }>(async (req, { params }) => {
  const user = await getApiUser();
  const input = await parseBody(req, featureFlagUpdateSchema);
  await adminUpdateFeatureFlag(
    { userId: user.id, platformRole: user.platformRole },
    params.key,
    input,
  );
  return { ok: true };
});
