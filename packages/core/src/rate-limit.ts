import { RATE_LIMITS, type RateLimitName } from "@repo/config";
import { db } from "@repo/database";
import { AppError } from "@repo/shared";

/**
 * Fixed-window rate limiting backed by PostgreSQL, so limits hold across
 * multiple app instances without extra infrastructure (spec §64).
 */
export async function rateLimit(name: RateLimitName, identifier: string): Promise<void> {
  const [max, windowSeconds] = RATE_LIMITS[name];
  const windowIndex = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `${name}:${identifier}:${windowIndex}`.slice(0, 250);
  const expiresAt = new Date((windowIndex + 1) * windowSeconds * 1000);
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "rate_limit_bucket" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "rate_limit_bucket"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > max) {
    const retryAfter = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    throw new AppError("RATE_LIMITED", { expose: { retryAfter } });
  }
}

export async function cleanupRateLimits(): Promise<number> {
  const result = await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
