import type { AiCallMeta, AiResult } from "../service/types";
import type { SalesCopilotAnswer } from "./schemas";
import type {
  ConversationAnalysis,
  LeadResearchResult,
  OutreachDraft,
  OutreachType,
} from "./schemas-core";
import type {
  DiscoveryMode,
  ListingRead,
  ProspectAssessment,
  ProspectDiscovery,
  ProspectSearchPlan,
} from "./schemas-discovery";

/**
 * Inputs for the AI Sales Agent. Core services build these from the
 * workspace's sales configuration and lead records; the AI layer never reads
 * the database itself.
 */

/** What the company sells and how it wants to sell it (company-authored). */
export interface SalesBusinessContext {
  companyName: string;
  companyDescription: string;
  website: string;
  offering: {
    name: string;
    description: string;
    priceRange: string;
    pricingModel: string | null;
    benefits: string[];
    features: string[];
    differentiators: string[];
  };
  icp: {
    industries: string[];
    companySizes: string[];
    countries: string[];
    cities: string[];
    jobTitles: string[];
    characteristics: string[];
  };
  valueProposition: {
    whyBuy: string;
    problemSolved: string;
    difference: string;
    outcomes: string[];
  };
  qualificationNotes: string;
  tone: { style: string; customInstructions: string };
  language: "en" | "ar" | "fr";
  matchProspectLanguage: boolean;
  responseLength: "SHORT" | "MEDIUM" | "DETAILED";
  discloseAutomation: boolean;
  playbook: {
    openingStyle: string;
    qualificationQuestions: string[];
    pricingPolicy: string;
    discountPolicy: string;
    competitorPositioning: string;
    meetingRules: string;
    followUpRules: string;
    forbiddenClaims: string[];
    escalationRules: string[];
    objections: Array<{ objection: string; response: string }>;
  };
}

/** A lead as the AI may see it (no internal ids, no other tenants' data). */
export interface SalesLeadContext {
  fullName: string;
  firstName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  location: string | null;
  companySize: string | null;
  status: string;
  source: string;
  notes: string | null;
  tags: string[];
  leadScore: number | null;
  scoreBand: string | null;
  scoreConfidence: number | null;
  qualification: {
    status: string;
    reason: string;
    met: string[];
    failed: string[];
    unknown: string[];
  } | null;
  factors: Array<{ label: string; score: number | null; reason: string }>;
  lastContactedAt: string | null;
  createdAt: string;
  /** Deterministic next-best actions computed by the platform (the AI explains, never invents new ones). */
  recommendations: Array<{ action: string; priority: "high" | "medium" | "low"; reason: string }>;
}

export interface SalesCopilotInput {
  business: SalesBusinessContext;
  lead: SalesLeadContext;
  /** Most recent first, already summarised. */
  recentActivity: Array<{ at: string; summary: string }>;
  question: string;
  /** Name of the signed-in user, used to sign drafts. */
  userName: string;
}

export interface ResearchInput {
  business: SalesBusinessContext;
  lead: SalesLeadContext;
  /** Pages fetched by a ResearchProvider (untrusted). */
  sources: Array<{ url: string; title: string | null; description: string | null; text: string }>;
  sourceNotes: string[];
}

export interface ConversationTurn {
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  at: string;
}

export interface OutreachInput {
  business: SalesBusinessContext;
  lead: SalesLeadContext;
  research: LeadResearchResult | null;
  type: OutreachType;
  channel: "EMAIL" | "LINKEDIN" | "SMS" | "WHATSAPP";
  language: "en" | "ar" | "fr";
  conversation: ConversationTurn[];
  senderName: string;
  instructions?: string;
}

export interface AnalyzeConversationInput {
  business: SalesBusinessContext;
  lead: SalesLeadContext;
  message: { subject: string | null; content: string };
  history: ConversationTurn[];
}

/** What to look for when discovering prospects (pre-filled from the ICP, editable per run). */
export interface DiscoveryCriteria {
  industries: string[];
  countries: string[];
  cities: string[];
  companySizes: string[];
  /** Free-text requirements from the sales team. */
  keywords: string;
  count: number;
  /** A circle on the map; when present it is the search area. */
  area?: { lat: number; lon: number; radiusKm: number; label?: string } | null;
}

/** "within 10 km of Hamra, Beirut" — the search area in words. */
export function describeArea(area: NonNullable<DiscoveryCriteria["area"]>): string {
  const where = area.label || `${area.lat.toFixed(4)}, ${area.lon.toFixed(4)}`;
  return `within ${area.radiusKm} km of ${where}`;
}

export interface DiscoverProspectsInput {
  business: SalesBusinessContext;
  criteria: DiscoveryCriteria;
  /** Companies already in the workspace, so they aren't returned again. */
  exclude: { names: string[]; domains: string[] };
}

/** Everything the prospecting agent gathered about one company (all untrusted). */
export interface CompanyEvidence {
  /** Stable reference for matching the assessment back. */
  ref: string;
  name: string | null;
  website: string | null;
  /** Address or place from open data, if any. */
  location: string | null;
  /** Short labelled facts, e.g. "OpenStreetMap: office=estate_agent". */
  facts: string[];
  /** Pages read from the company's own site. */
  pages: Array<{ url: string; title: string | null; text: string }>;
}

export interface ProspectPlanInput {
  business: SalesBusinessContext;
  criteria: DiscoveryCriteria;
}

export interface ReadListingInput {
  business: SalesBusinessContext;
  criteria: DiscoveryCriteria;
  page: {
    url: string;
    title: string | null;
    text: string;
    links: Array<{ url: string; text: string }>;
  };
}

export interface AssessProspectsInput {
  business: SalesBusinessContext;
  criteria: DiscoveryCriteria;
  companies: CompanyEvidence[];
}

export interface SalesAI {
  readonly providerName: string;
  readonly modelName: string;
  /** True when a real language model is configured (cloud or local); false for keyword rules. */
  readonly canReason: boolean;
  /** Prospecting agent, step 1: turn the ICP into open-data queries and pages worth reading. */
  planProspectSearch(
    input: ProspectPlanInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<ProspectSearchPlan>>;
  /** Step 2: extract the companies a fetched directory page lists, and links worth following. */
  readListingPage(input: ReadListingInput, meta?: AiCallMeta): Promise<AiResult<ListingRead>>;
  /** Step 3: judge gathered companies against the ICP and pull named leaders from their pages. */
  assessProspects(
    input: AssessProspectsInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<ProspectAssessment>>;
  /** "web": real web search; "demo": fictional samples (DEMO_MODE); "unavailable": no permitted source. */
  readonly discoveryMode: DiscoveryMode;
  discoverProspects(
    input: DiscoverProspectsInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<ProspectDiscovery>>;
  copilot(input: SalesCopilotInput, meta?: AiCallMeta): Promise<AiResult<SalesCopilotAnswer>>;
  research(input: ResearchInput, meta?: AiCallMeta): Promise<AiResult<LeadResearchResult>>;
  generateOutreach(input: OutreachInput, meta?: AiCallMeta): Promise<AiResult<OutreachDraft>>;
  analyzeConversation(
    input: AnalyzeConversationInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<ConversationAnalysis>>;
}
