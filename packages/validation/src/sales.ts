import { z } from "zod";
import { LEAD_SOURCES, LEAD_STATUSES, MESSAGE_DIRECTIONS, SALES_CHANNELS } from "@repo/shared";
import { paginationSchema } from "./common";

/**
 * AI Sales Agent schemas: the agent's business configuration (what we sell, to
 * whom, how) and lead inputs. Configuration sections are all optional with
 * sensible defaults so onboarding can be saved step by step.
 */

const text = (max: number) => z.string().trim().max(max).default("");
const list = (maxItems = 40, maxLength = 160) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).default([]);
const optionalCount = z.number().int().min(0).max(10_000_000).nullable().default(null);

export const SALES_TONES = [
  "PROFESSIONAL",
  "FRIENDLY",
  "CONVERSATIONAL",
  "PERSUASIVE",
  "CONSULTATIVE",
  "TECHNICAL",
  "CUSTOM",
] as const;
export type SalesTone = (typeof SALES_TONES)[number];

/** Human-approval modes (spec §25). APPROVAL_REQUIRED is the default. */
export const AUTONOMY_MODES = ["AUTONOMOUS", "APPROVAL_REQUIRED", "ASSISTED"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const SALES_LANGUAGES = ["en", "ar", "fr"] as const;
export type SalesLanguage = (typeof SALES_LANGUAGES)[number];

export const QUALIFICATION_STRICTNESS = ["LENIENT", "BALANCED", "STRICT"] as const;
export type QualificationStrictness = (typeof QUALIFICATION_STRICTNESS)[number];

/** Company-size bands used by the ICP and lead records. */
export const COMPANY_SIZE_BANDS = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;
export type CompanySizeBand = (typeof COMPANY_SIZE_BANDS)[number];

export const PRICING_MODELS = [
  "ONE_TIME",
  "MONTHLY",
  "ANNUAL",
  "USAGE_BASED",
  "PER_PROJECT",
  "CUSTOM",
] as const;

/** Lead fields a qualification rule can test. */
export const RULE_FIELDS = [
  "industry",
  "country",
  "city",
  "companySize",
  "jobTitle",
  "companyName",
  "email",
  "phone",
  "website",
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPERATORS = ["equals", "contains", "oneOf", "isPresent", "minEmployees"] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const qualificationRuleSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1, "Describe the rule").max(200),
  field: z.enum(RULE_FIELDS),
  operator: z.enum(RULE_OPERATORS),
  /** For oneOf: comma-separated values. Ignored by isPresent. */
  value: z.string().trim().max(400).default(""),
  /** A failed required rule makes the lead unqualified. */
  required: z.boolean().default(false),
});
export type QualificationRule = z.infer<typeof qualificationRuleSchema>;

export const SCORE_FACTORS = [
  "industryFit",
  "locationFit",
  "roleRelevance",
  "companySizeFit",
  "qualificationFit",
  "problemRelevance",
  "intent",
  "engagement",
] as const;
export type ScoreFactor = (typeof SCORE_FACTORS)[number];

const weight = (value: number) => z.number().int().min(0).max(100).default(value);

export const salesCompanyProfileSchema = z.object({
  name: text(160),
  website: text(300),
  industry: text(120),
  country: text(80),
  description: text(2_000),
  employees: text(40),
});

export const salesOfferingSchema = z.object({
  name: text(160),
  description: text(3_000),
  priceRange: text(160),
  pricingModel: z.enum(PRICING_MODELS).nullable().default(null),
  benefits: list(),
  features: list(),
  differentiators: list(),
});

export const salesIcpSchema = z.object({
  industries: list(),
  companySizes: z.array(z.enum(COMPANY_SIZE_BANDS)).max(5).default([]),
  countries: list(),
  cities: list(),
  jobTitles: list(),
  revenueRange: text(120),
  technologies: list(),
  characteristics: list(30, 300),
});

export const salesValuePropositionSchema = z.object({
  whyBuy: text(2_000),
  problemSolved: text(2_000),
  difference: text(2_000),
  outcomes: list(20, 300),
});

export const salesQualificationSchema = z.object({
  rules: z.array(qualificationRuleSchema).max(30).default([]),
  /** Free-text criteria the AI considers (never auto-applied without evidence). */
  notes: text(2_000),
});

export const salesToneSchema = z.object({
  style: z.enum(SALES_TONES).default("PROFESSIONAL"),
  customInstructions: text(2_000),
});

export const salesGoalsSchema = z.object({
  monthlyLeads: optionalCount,
  monthlyMeetings: optionalCount,
  monthlyCustomers: optionalCount,
  monthlyRevenue: z.number().min(0).max(1_000_000_000).nullable().default(null),
  revenueCurrency: z.string().trim().length(3).default("USD"),
  /** Target lead → customer conversion, in percent. */
  conversionRate: z.number().min(0).max(100).nullable().default(null),
});

export const salesScoringSchema = z.object({
  weights: z
    .object({
      industryFit: weight(20),
      locationFit: weight(10),
      roleRelevance: weight(15),
      companySizeFit: weight(10),
      qualificationFit: weight(15),
      problemRelevance: weight(10),
      intent: weight(10),
      engagement: weight(10),
    })
    .prefault({}),
  bands: z
    .object({
      hot: z.number().int().min(1).max(100).default(90),
      high: z.number().int().min(1).max(100).default(70),
      medium: z.number().int().min(1).max(100).default(50),
      low: z.number().int().min(1).max(100).default(30),
    })
    .prefault({})
    .refine((b) => b.hot > b.high && b.high > b.medium && b.medium > b.low, {
      message: "Score bands must be in descending order (hot > high > medium > low)",
    }),
});

export const salesBehaviorSchema = z.object({
  autonomy: z.enum(AUTONOMY_MODES).default("APPROVAL_REQUIRED"),
  language: z.enum(SALES_LANGUAGES).default("en"),
  /** Reply in the prospect's language when it differs from the default. */
  matchProspectLanguage: z.boolean().default(true),
  /** Disclose that messages are prepared with AI assistance. */
  discloseAutomation: z.boolean().default(true),
  qualificationStrictness: z.enum(QUALIFICATION_STRICTNESS).default("BALANCED"),
  /** Below this AI confidence (0–100) the agent escalates to a human. */
  escalationThreshold: z.number().int().min(0).max(100).default(60),
  responseLength: z.enum(["SHORT", "MEDIUM", "DETAILED"]).default("SHORT"),
});

/** Sales playbook (spec §54–55): how the company wants to sell. */
export const salesPlaybookSchema = z.object({
  openingStyle: text(1_000),
  qualificationQuestions: list(20, 300),
  pricingPolicy: text(1_500),
  discountPolicy: text(1_000),
  competitorPositioning: text(1_500),
  meetingRules: text(1_000),
  followUpRules: text(1_000),
  forbiddenClaims: list(30, 300),
  escalationRules: list(20, 300),
  objections: z
    .array(
      z.object({
        objection: z.string().trim().min(1).max(300),
        response: z.string().trim().min(1).max(1_500),
      }),
    )
    .max(30)
    .default([
      {
        objection: "Too expensive",
        response:
          "Acknowledge it, ask what they're comparing against, and focus on the outcome and payback — never offer a discount unless the discount policy allows it.",
      },
      {
        objection: "Not interested",
        response: "Thank them, ask if it's the timing or the fit, and respect a clear no.",
      },
      {
        objection: "Send me information",
        response: "Send a short, relevant overview and suggest one specific next step.",
      },
      {
        objection: "We already have a provider",
        response:
          "Respect it; ask what they'd improve and mention one concrete difference without criticising the competitor.",
      },
      { objection: "Call me later", response: "Agree on a specific time and follow up then." },
      {
        objection: "I need to discuss with my partner",
        response: "Offer a short summary they can share and propose a call including the partner.",
      },
    ]),
});
export type SalesPlaybook = z.infer<typeof salesPlaybookSchema>;

export const salesAgentConfigSchema = z.object({
  company: salesCompanyProfileSchema.prefault({}),
  offering: salesOfferingSchema.prefault({}),
  icp: salesIcpSchema.prefault({}),
  valueProposition: salesValuePropositionSchema.prefault({}),
  qualification: salesQualificationSchema.prefault({}),
  tone: salesToneSchema.prefault({}),
  goals: salesGoalsSchema.prefault({}),
  scoring: salesScoringSchema.prefault({}),
  behavior: salesBehaviorSchema.prefault({}),
  playbook: salesPlaybookSchema.prefault({}),
});
export type SalesAgentConfig = z.infer<typeof salesAgentConfigSchema>;
export type SalesAgentConfigInput = z.input<typeof salesAgentConfigSchema>;

export const SALES_CONFIG_SECTIONS = [
  "company",
  "offering",
  "icp",
  "valueProposition",
  "qualification",
  "tone",
  "goals",
  "scoring",
  "behavior",
  "playbook",
] as const;
export type SalesConfigSection = (typeof SALES_CONFIG_SECTIONS)[number];

export const SALES_SECTION_SCHEMAS = {
  company: salesCompanyProfileSchema,
  offering: salesOfferingSchema,
  icp: salesIcpSchema,
  valueProposition: salesValuePropositionSchema,
  qualification: salesQualificationSchema,
  tone: salesToneSchema,
  goals: salesGoalsSchema,
  scoring: salesScoringSchema,
  behavior: salesBehaviorSchema,
  playbook: salesPlaybookSchema,
} as const satisfies Record<SalesConfigSection, z.ZodType>;

export const updateSalesConfigSchema = z.object({
  section: z.enum(SALES_CONFIG_SECTIONS),
  data: z.unknown(),
  /** Marks the onboarding wizard finished (activates the agent). */
  completeOnboarding: z.boolean().optional(),
});

/** Parse stored JSON into a full config; invalid stored data falls back to defaults. */
export function parseSalesAgentConfig(value: unknown): SalesAgentConfig {
  const parsed = salesAgentConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : salesAgentConfigSchema.parse({});
}

// ───────────────────────────── Leads ─────────────────────────────

const optionalField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address");

const optionalWebUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .refine((v) => v === null || z.url().safeParse(v).success, "Enter a valid URL");

export const leadFieldsSchema = z.object({
  firstName: optionalField(80),
  lastName: optionalField(80),
  companyName: optionalField(200),
  jobTitle: optionalField(160),
  email: optionalEmail,
  phone: optionalField(40),
  website: optionalWebUrl,
  linkedinUrl: optionalWebUrl,
  location: optionalField(200),
  city: optionalField(120),
  country: optionalField(80),
  industry: optionalField(120),
  companySize: optionalField(40),
  notes: optionalField(10_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ownerId: optionalField(64),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});

const leadIdentityRefine = (lead: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
}) => Boolean(lead.firstName || lead.lastName || lead.companyName || lead.email);

export const createLeadSchema = leadFieldsSchema
  .extend({ source: z.enum(LEAD_SOURCES).default("MANUAL") })
  .refine(leadIdentityRefine, {
    message: "Add at least a name, a company or an email",
    path: ["firstName"],
  });
export type CreateLeadInput = z.input<typeof createLeadSchema>;
export type CreateLeadData = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = leadFieldsSchema.partial();
export type UpdateLeadInput = z.input<typeof updateLeadSchema>;

export const changeLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export const LEAD_SORTS = ["score", "newest", "updated", "name"] as const;

export const leadListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  /** One status, or several separated by commas (a pipeline stage such as "MEETING_REQUESTED,MEETING_BOOKED"). */
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((x) => x.trim()) : undefined))
    .pipe(z.array(z.enum(LEAD_STATUSES)).max(LEAD_STATUSES.length).optional()),
  band: z.enum(["hot", "high", "medium", "low", "very_low", "unscored"]).optional(),
  ownerId: z.string().trim().max(64).optional(),
  tag: z.string().trim().max(40).optional(),
  sort: z.enum(LEAD_SORTS).default("score"),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

export const LEAD_IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "companyName",
  "jobTitle",
  "email",
  "phone",
  "website",
  "linkedinUrl",
  "location",
  "city",
  "country",
  "industry",
  "companySize",
  "notes",
  "tags",
] as const;
export type LeadImportField = (typeof LEAD_IMPORT_FIELDS)[number];

export const leadImportSchema = z.object({
  csv: z.string().min(1, "The file is empty").max(5_000_000),
  /** header → field (null = ignore). Omit to auto-detect. */
  mapping: z.record(z.string(), z.enum(LEAD_IMPORT_FIELDS).nullable()).optional(),
  commit: z.boolean().default(false),
});

export const salesCopilotSchema = z.object({
  question: z.string().trim().min(2, "Ask a question").max(1_000),
});

// ───────────────────────────── AI sales core ─────────────────────────────

export const OUTREACH_MESSAGE_TYPES = [
  "COLD_EMAIL",
  "FOLLOW_UP",
  "LINKEDIN_MESSAGE",
  "SMS",
  "WHATSAPP",
  "MEETING_CONFIRMATION",
  "RE_ENGAGEMENT",
  "PROPOSAL_FOLLOW_UP",
  "POST_MEETING_FOLLOW_UP",
] as const;

export const generateOutreachSchema = z.object({
  type: z.enum(OUTREACH_MESSAGE_TYPES),
  language: z.enum(SALES_LANGUAGES).optional(),
  instructions: z.string().trim().max(600).optional(),
});

export const logMessageSchema = z.object({
  direction: z.enum(MESSAGE_DIRECTIONS),
  channel: z.enum(SALES_CHANNELS).default("EMAIL"),
  subject: z.string().trim().max(300).optional().nullable(),
  content: z.string().trim().min(1, "Paste the message").max(20_000),
  occurredAt: z.coerce.date().optional(),
});

export const updateDraftSchema = z.object({
  subject: z.string().trim().max(300).nullable().optional(),
  content: z.string().trim().min(1).max(20_000).optional(),
  status: z.enum(["DRAFT", "APPROVED", "DISCARDED"]).optional(),
});

// ───────────────────────────── prospect discovery ─────────────────────────────

const criteriaList = z.array(z.string().trim().min(1).max(120)).max(10).default([]);

export const DISCOVERY_MAX_RADIUS_KM = 200;

/** A search circle on the map. */
export const discoveryAreaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.5).max(DISCOVERY_MAX_RADIUS_KM),
  /** Human-readable place name for the centre, e.g. "Hamra, Beirut, Lebanon". */
  label: z.string().trim().max(200).optional(),
});
export type DiscoveryArea = z.infer<typeof discoveryAreaSchema>;

/** One discovery run; criteria default to the ICP in the UI and are editable per run. */
export const discoveryRequestSchema = z.object({
  industries: criteriaList,
  countries: criteriaList,
  cities: criteriaList,
  companySizes: z.array(z.enum(COMPANY_SIZE_BANDS)).max(5).default([]),
  keywords: z.string().trim().max(500).default(""),
  count: z.coerce.number().int().min(1).max(25).default(10),
  /** quick: a minute or two; deep: more sources, directory pages and websites (several minutes). */
  depth: z.enum(["quick", "deep"]).default("deep"),
  /** A circle drawn on the map; when set, it replaces countries / cities as the search area. */
  area: discoveryAreaSchema.nullable().default(null),
});
export type DiscoveryRequestInput = z.input<typeof discoveryRequestSchema>;

/** Place search for the map ("Hamra, Beirut"). */
export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(2, "Type a place to search for").max(120),
});

export const addDiscoveredLeadsSchema = z.object({
  candidateIds: z
    .array(z.string().trim().min(1).max(40))
    .min(1, "Select at least one company")
    .max(25),
  /** Queue AI research for each added lead. */
  research: z.boolean().default(false),
});
