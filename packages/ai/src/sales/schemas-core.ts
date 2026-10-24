import { z } from "zod";
import { COPILOT_ACTIONS, FACT_BASES } from "./schemas";

/**
 * Structured outputs for the AI Sales Core (spec §12, §17, §23–24). Every
 * schema avoids open records and uses nullable (not optional) fields so all
 * providers produce the same shape. Outputs are advice: business logic decides
 * what is stored or changed.
 */

const fact = z.object({
  statement: z.string().min(1).max(400),
  basis: z.enum(FACT_BASES),
  /** URL of the page the fact came from, or "Lead record" / "Your company profile". */
  source: z.string().max(500).nullable(),
});
export type SourcedFact = z.infer<typeof fact>;

// ───────────────────────────── research ─────────────────────────────

export const leadResearchSchema = z.object({
  companySummary: z.string().max(1_200),
  industry: fact.nullable(),
  productsServices: z.array(fact).max(8),
  companySizeEstimate: fact.nullable(),
  location: fact.nullable(),
  potentialProblems: z.array(fact).max(6),
  potentialNeeds: z.array(fact).max(6),
  possibleDecisionMaker: fact.nullable(),
  personalizationPoints: z.array(fact).max(6),
  salesOpportunity: z.string().max(800),
  /** 0–100: how relevant the prospect's likely problems are to what we sell. null = can't tell. */
  problemRelevance: z.number().int().min(0).max(100).nullable(),
  /** Free-text qualification notes from the company, checked against evidence. */
  qualificationNotesAssessment: z
    .object({ meets: z.boolean().nullable(), reason: z.string().max(400) })
    .nullable(),
  unknowns: z.array(z.string().min(1).max(200)).max(8),
  confidence: z.number().min(0).max(1),
});
export type LeadResearchResult = z.infer<typeof leadResearchSchema>;

// ───────────────────────────── outreach ─────────────────────────────

export const OUTREACH_TYPES = [
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
export type OutreachType = (typeof OUTREACH_TYPES)[number];

export const outreachDraftSchema = z.object({
  /** null for channels without subjects (SMS, WhatsApp, LinkedIn). */
  subject: z.string().max(160).nullable(),
  opening: z.string().max(400),
  personalization: z.string().max(600),
  valueProposition: z.string().max(600),
  callToAction: z.string().max(300),
  signature: z.string().max(200),
  /** The complete message as it would be sent. */
  body: z.string().min(1).max(4_000),
  /** Each personal detail used, with where it came from. */
  personalizationSources: z.array(fact).max(6),
  /** Anything the reviewer should check before sending. */
  reviewNotes: z.array(z.string().min(1).max(300)).max(5),
  language: z.enum(["en", "ar", "fr"]),
});
export type OutreachDraft = z.infer<typeof outreachDraftSchema>;

// ───────────────────────────── conversations ─────────────────────────────

/** Inbound reply intents (spec §24). */
export const REPLY_INTENTS = [
  "INTERESTED",
  "QUESTION",
  "PRICE_REQUEST",
  "MEETING_REQUEST",
  "NOT_INTERESTED",
  "LATER",
  "OBJECTION",
  "OUT_OF_OFFICE",
  "WRONG_PERSON",
  "UNSUBSCRIBE",
  "UNKNOWN",
] as const;
export type ReplyIntent = (typeof REPLY_INTENTS)[number];

export const BUYING_STAGES = [
  "UNAWARE",
  "AWARE",
  "CONSIDERING",
  "EVALUATING",
  "READY_TO_BUY",
  "NOT_BUYING",
  "UNKNOWN",
] as const;

export const conversationAnalysisSchema = z.object({
  intent: z.enum(REPLY_INTENTS),
  /** 0–100 buying intent. */
  intentScore: z.number().int().min(0).max(100),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
  buyingStage: z.enum(BUYING_STAGES),
  painPoints: z.array(z.string().min(1).max(200)).max(5),
  objections: z
    .array(
      z.object({
        category: z.enum([
          "PRICE",
          "TIMING",
          "EXISTING_PROVIDER",
          "NO_NEED",
          "AUTHORITY",
          "TRUST",
          "OTHER",
        ]),
        text: z.string().min(1).max(300),
      }),
    )
    .max(5),
  questions: z.array(z.string().min(1).max(300)).max(5),
  requestedInformation: z.array(z.string().min(1).max(200)).max(5),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
  /** Language the prospect wrote in. */
  language: z.enum(["en", "ar", "fr", "other"]),
  summary: z.string().max(600),
  nextAction: z.object({ action: z.enum(COPILOT_ACTIONS), reason: z.string().min(1).max(400) }),
  /** A suggested reply for the user to review (null when no reply should be sent). */
  suggestedReply: z.string().max(3_000).nullable(),
  /** True when a person should take over (legal, security, anger, custom contract, low confidence…). */
  escalate: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type ConversationAnalysis = z.infer<typeof conversationAnalysisSchema>;
