import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Security primitives for invitation tokens and candidate session credentials.
 * Raw tokens are only ever shown once (in the invitation URL); the database
 * stores a SHA-256 hash so a database leak cannot be replayed as valid links.
 */

/** 256-bit, URL-safe random token. */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Token format sanity check before touching the database (cheap rejection of garbage). */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

/** Hash an IP / identifier for privacy-preserving storage (rate limits, consent audit). */
export function anonymize(value: string, salt: string): string {
  return createHmac("sha256", salt).update(value).digest("hex").slice(0, 32);
}

export function randomStorageName(extension: string): string {
  const safeExt = extension.replace(/[^a-z0-9.]/gi, "").toLowerCase();
  return `${randomBytes(16).toString("hex")}${safeExt.startsWith(".") ? safeExt : safeExt ? `.${safeExt}` : ""}`;
}
