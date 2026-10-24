import { adminSetFeatureFlagOverride } from "@repo/core";
import { featureFlagOverrideSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiUser } from "@/server/auth-context";

export const POST = route<{ key: string }>(async (req, { params }) => {
  const user = await getApiUser();
  const input = await parseBody(req, featureFlagOverrideSchema);
  await adminSetFeatureFlagOverride(
    { userId: user.id, platformRole: user.platformRole },
    params.key,
    input,
  );
  return { ok: true };
});
