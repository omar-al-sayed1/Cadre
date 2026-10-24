import { z } from "zod";
import { idSchema } from "./common";

export const featureFlagUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  description: z.string().trim().max(300).optional(),
});

export const featureFlagOverrideSchema = z.object({
  companyId: idSchema,
  enabled: z.boolean().nullable(),
});

export const assignPlanSchema = z.object({
  planKey: z.string().trim().min(1).max(40),
});
