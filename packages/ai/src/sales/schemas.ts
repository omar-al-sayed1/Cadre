import { z } from "zod";

/**
 * Structured output for the sales copilot (spec §26, §46). The model returns
 * this JSON; business logic decides what (if anything) happens next. No
 * recommendation is executed automatically.
 */

export const COPILOT_QUESTION_TYPES = [
  "APPROACH",
  "DRAFT_MESSAGE",
  "QUALIFICATION",
  "NEXT_ACTION",
  "SUMMARY",
  "OBJECTION",
  "OTHER",
] as const;

export const COPILOT_ACTIONS = [
  "RESEARCH_LEAD",
  "ADD_DETAILS",
  "QUALIFY",
  "DISQUALIFY",
  "CONTACT",
  "FOLLOW_UP",
  "SEND_INFORMATION",
  "HANDLE_OBJECTION",
  "SCHEDULE_CALL",
  "WAIT",
  "ESCALATE_TO_HUMAN",
  "STOP_OUTREACH",
] as const;
export type CopilotAction = (typeof COPILOT_ACTIONS)[number];

/** Where a statement comes from (spec §12: verified vs inference vs unknown). */
export const FACT_BASES = ["VERIFIED", "INFERRED", "UNKNOWN"] as const;

export const salesCopilotAnswerSchema = z.object({
  questionType: z.enum(COPILOT_QUESTION_TYPES),
  /** Plain text for the sales user (not the prospect), concise. */
  answer: z.string().min(1).max(2_500),
  /** Present when the user asked for a message; never sent automatically. */
  draft: z
    .object({
      channel: z.enum(["EMAIL", "LINKEDIN", "SMS", "WHATSAPP"]),
      subject: z.string().max(200).nullable(),
      body: z.string().min(1).max(4_000),
    })
    .nullable(),
  recommendedActions: z
    .array(z.object({ action: z.enum(COPILOT_ACTIONS), reason: z.string().min(1).max(400) }))
    .max(3),
  /** Key statements behind the answer, each labelled with its basis. */
  facts: z
    .array(
      z.object({
        statement: z.string().min(1).max(400),
        basis: z.enum(FACT_BASES),
        /** e.g. "Lead record", "Your company profile", a URL when research was used. */
        source: z.string().max(300).nullable(),
      }),
    )
    .max(10),
  /** Information that would materially improve the answer. */
  missingInformation: z.array(z.string().min(1).max(200)).max(6),
  /** 0–1: how confident the assistant is in this answer. */
  confidence: z.number().min(0).max(1),
});
export type SalesCopilotAnswer = z.infer<typeof salesCopilotAnswerSchema>;
