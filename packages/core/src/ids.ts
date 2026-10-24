import { randomBytes } from "node:crypto";

/** Collision-resistant, sortable-ish id for rows created by services (cuid-compatible charset). */
export function createId(prefix = "c"): string {
  const time = Date.now().toString(36);
  const random = randomBytes(10).toString("hex");
  return `${prefix}${time}${random}`.slice(0, 32);
}
