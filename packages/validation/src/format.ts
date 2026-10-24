import type { z } from "zod";

/** Flatten zod issues into `{ "path.to.field": ["message"] }` for API responses and forms. */
export function formatZodError(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
