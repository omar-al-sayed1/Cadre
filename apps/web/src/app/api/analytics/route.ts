import { z } from "zod";
import { getCompanyAnalytics } from "@repo/core";
import { idSchema } from "@repo/validation";
import { route, searchParams } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(730).default(90),
  jobId: idSchema.optional(),
});

export const GET = route(async (req) => {
  const actor = await getApiActor();
  return getCompanyAnalytics(actor, querySchema.parse(searchParams(req)));
});
