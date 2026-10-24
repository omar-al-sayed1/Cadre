import { z } from "zod";
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  JOB_STATUSES,
  SKILL_CATEGORIES,
  SKILL_LEVELS,
  WORK_MODES,
} from "@repo/shared";
import { idSchema, longText, optionalText, paginationSchema, requiredText } from "./common";

export const jobSkillInputSchema = z
  .object({
    skillId: idSchema.optional(),
    name: z.string().trim().min(1).max(80).optional(),
    category: z.enum(SKILL_CATEGORIES).default("TECHNICAL"),
    weight: z.number().int().min(0).max(100),
    expectedLevel: z.enum(SKILL_LEVELS).default("INTERMEDIATE"),
    isCritical: z.boolean().default(false),
  })
  .refine((s) => Boolean(s.skillId) || Boolean(s.name), "Each skill needs a name");
export type JobSkillInput = z.input<typeof jobSkillInputSchema>;

const skillsArray = z
  .array(jobSkillInputSchema)
  .max(25, "Use at most 25 skills")
  .refine(
    (skills) => skills.length === 0 || skills.reduce((sum, s) => sum + s.weight, 0) === 100,
    "Skill weights must add up to 100%",
  )
  .refine((skills) => {
    const names = skills.map((s) => (s.skillId ?? s.name ?? "").toLowerCase());
    return new Set(names).size === names.length;
  }, "Each skill can only be added once");

const jobFields = {
  title: requiredText(140, "Job title"),
  department: optionalText(100),
  location: optionalText(140),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("FULL_TIME"),
  workMode: z.enum(WORK_MODES).default("REMOTE"),
  description: longText(),
  responsibilities: longText(),
  requirements: longText(),
  preferredQualifications: longText(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).default("MID"),
  minExperienceYears: z.number().int().min(0).max(50).optional().nullable(),
  maxExperienceYears: z.number().int().min(0).max(50).optional().nullable(),
  salaryMin: z.number().int().min(0).max(10_000_000).optional().nullable(),
  salaryMax: z.number().int().min(0).max(10_000_000).optional().nullable(),
  salaryCurrency: z.string().trim().length(3).toUpperCase().optional().nullable(),
  status: z.enum(JOB_STATUSES).default("DRAFT"),
};

const experienceRefine = (v: {
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
}) =>
  v.minExperienceYears == null ||
  v.maxExperienceYears == null ||
  v.minExperienceYears <= v.maxExperienceYears;
const salaryRefine = (v: { salaryMin?: number | null; salaryMax?: number | null }) =>
  v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax;

export const createJobSchema = z
  .object({ ...jobFields, skills: skillsArray.default([]) })
  .refine(experienceRefine, {
    message: "Minimum experience can't exceed maximum",
    path: ["maxExperienceYears"],
  })
  .refine(salaryRefine, { message: "Minimum salary can't exceed maximum", path: ["salaryMax"] });
export type CreateJobInput = z.input<typeof createJobSchema>;
export type CreateJobData = z.infer<typeof createJobSchema>;

export const updateJobSchema = z
  .object({
    title: jobFields.title.optional(),
    department: jobFields.department,
    location: jobFields.location,
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    workMode: z.enum(WORK_MODES).optional(),
    description: z.string().trim().max(20_000).optional(),
    responsibilities: z.string().trim().max(20_000).optional(),
    requirements: z.string().trim().max(20_000).optional(),
    preferredQualifications: z.string().trim().max(20_000).optional(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
    minExperienceYears: jobFields.minExperienceYears,
    maxExperienceYears: jobFields.maxExperienceYears,
    salaryMin: jobFields.salaryMin,
    salaryMax: jobFields.salaryMax,
    salaryCurrency: jobFields.salaryCurrency,
    status: z.enum(JOB_STATUSES).optional(),
    skills: skillsArray.optional(),
  })
  .refine(experienceRefine, {
    message: "Minimum experience can't exceed maximum",
    path: ["maxExperienceYears"],
  })
  .refine(salaryRefine, { message: "Minimum salary can't exceed maximum", path: ["salaryMax"] });
export type UpdateJobInput = z.input<typeof updateJobSchema>;

export const jobListQuerySchema = paginationSchema.extend({
  status: z.enum(JOB_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;

export const createSkillSchema = z.object({
  name: requiredText(80, "Skill name"),
  category: z.enum(SKILL_CATEGORIES).default("TECHNICAL"),
  description: optionalText(500),
});
