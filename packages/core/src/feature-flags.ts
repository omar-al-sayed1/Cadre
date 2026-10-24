import { createHash } from "node:crypto";
import { FEATURE_FLAGS, FEATURE_FLAG_KEYS, type FeatureFlagKey } from "@repo/config";
import { db } from "@repo/database";

/**
 * Feature flags (spec §78): per-company override → global toggle with
 * percentage rollout (stable hash of company id) → code default.
 */
function inRollout(companyId: string, key: string, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  const bucket =
    Number.parseInt(
      createHash("sha256").update(`${key}:${companyId}`).digest("hex").slice(0, 8),
      16,
    ) % 100;
  return bucket < percentage;
}

export async function isFeatureEnabled(
  companyId: string | null,
  key: FeatureFlagKey,
): Promise<boolean> {
  const flag = await db.featureFlag.findUnique({
    where: { key },
    include: companyId ? { overrides: { where: { companyId } } } : undefined,
  });
  if (!flag) return FEATURE_FLAGS[key].default;
  const override = (flag as { overrides?: Array<{ enabled: boolean }> }).overrides?.[0];
  if (override) return override.enabled;
  if (!flag.enabled) return false;
  return companyId
    ? inRollout(companyId, key, flag.rolloutPercentage)
    : flag.rolloutPercentage >= 100;
}

export async function getFeatureFlags(
  companyId: string | null,
): Promise<Record<FeatureFlagKey, boolean>> {
  const entries = await Promise.all(
    FEATURE_FLAG_KEYS.map(async (key) => [key, await isFeatureEnabled(companyId, key)] as const),
  );
  return Object.fromEntries(entries) as Record<FeatureFlagKey, boolean>;
}
