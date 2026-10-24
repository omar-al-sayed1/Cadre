import { detectPromptInjection } from "../prompts/safety";
import { demoAnalyzeConversation, demoOutreach, demoResearch } from "./demo-sales-core";
import {
  SALES_ANALYSIS_PROMPT_VERSION,
  SALES_OUTREACH_PROMPT_VERSION,
  SALES_RESEARCH_PROMPT_VERSION,
} from "./prompts/core.v1";
import type { ConversationAnalysis, LeadResearchResult, OutreachDraft } from "./schemas-core";
import { demoDiscoverProspects } from "./demo-discovery";
import { SALES_DISCOVERY_PROMPT_VERSION } from "./prompts/discovery.v1";
import { SALES_PROSPECTING_PROMPT_VERSION } from "./prompts/prospecting.v1";
import { rulesAssess, rulesPlan, rulesReadListing } from "./prospecting-rules";
import type { ProspectDiscovery } from "./schemas-discovery";
import type {
  AnalyzeConversationInput,
  AssessProspectsInput,
  DiscoverProspectsInput,
  ProspectPlanInput,
  ReadListingInput,
  OutreachInput,
  ResearchInput,
} from "./types";
import type { AiCallMeta, AiResult } from "../service/types";
import { SALES_COPILOT_PROMPT_VERSION } from "./prompts/copilot.v1";
import {
  COPILOT_ACTIONS,
  salesCopilotAnswerSchema,
  type CopilotAction,
  type SalesCopilotAnswer,
} from "./schemas";
import type { SalesAI, SalesCopilotInput, SalesLeadContext } from "./types";

/**
 * Deterministic stand-in for the sales copilot (DEMO_MODE / tests). It answers
 * only from the lead record, the score breakdown and the company profile — it
 * never invents facts — and says plainly what it can't know.
 */

type QuestionType = SalesCopilotAnswer["questionType"];

function classify(question: string): QuestionType {
  const q = question.toLowerCase();
  if (/\b(write|draft|compose|email|message|follow[- ]?up|reach out|intro)\b/.test(q))
    return "DRAFT_MESSAGE";
  if (/\b(qualif|fit|icp|good lead|worth)\w*/.test(q)) return "QUALIFICATION";
  if (/\bobjection|concern|push ?back\b/.test(q)) return "OBJECTION";
  if (/\bsummar/.test(q)) return "SUMMARY";
  if (/\b(approach|pitch|angle|open with|start)\b/.test(q)) return "APPROACH";
  if (/\b(next|what should i do|recommend|priorit)\w*/.test(q)) return "NEXT_ACTION";
  return "OTHER";
}

/** The platform's deterministic recommendations, restricted to known copilot actions. */
function leadActions(lead: SalesLeadContext): Array<{ action: CopilotAction; reason: string }> {
  return lead.recommendations
    .filter((r): r is typeof r & { action: CopilotAction } =>
      (COPILOT_ACTIONS as readonly string[]).includes(r.action),
    )
    .map((r) => ({ action: r.action, reason: r.reason }))
    .slice(0, 3);
}

function verifiedFacts(lead: SalesLeadContext): SalesCopilotAnswer["facts"] {
  const facts: SalesCopilotAnswer["facts"] = [];
  if (lead.jobTitle && lead.companyName)
    facts.push({
      statement: `${lead.fullName} is ${lead.jobTitle} at ${lead.companyName}.`,
      basis: "VERIFIED",
      source: "Lead record",
    });
  else if (lead.companyName)
    facts.push({
      statement: `Works at ${lead.companyName}.`,
      basis: "VERIFIED",
      source: "Lead record",
    });
  if (lead.industry)
    facts.push({
      statement: `Industry: ${lead.industry}.`,
      basis: "VERIFIED",
      source: "Lead record",
    });
  const place = [lead.city, lead.country].filter(Boolean).join(", ") || lead.location;
  if (place)
    facts.push({ statement: `Based in ${place}.`, basis: "VERIFIED", source: "Lead record" });
  if (lead.companySize)
    facts.push({
      statement: `Company size: ${lead.companySize}.`,
      basis: "VERIFIED",
      source: "Lead record",
    });
  const role = lead.factors.find((f) => f.label === "Role relevance");
  if (role?.score !== null && role?.reason.includes("decision maker"))
    facts.push({ statement: role.reason, basis: "INFERRED", source: "Job title" });
  for (const f of lead.factors
    .filter((f) => f.score === null && /unknown/i.test(f.reason))
    .slice(0, 3)) {
    facts.push({ statement: f.reason, basis: "UNKNOWN", source: null });
  }
  return facts.slice(0, 10);
}

function missingInformation(input: SalesCopilotInput): string[] {
  const { lead, business } = input;
  const missing: string[] = [];
  if (!lead.hasEmail) missing.push("Email address");
  if (!lead.jobTitle) missing.push("Job title");
  if (!lead.industry) missing.push("Industry");
  if (!lead.companySize) missing.push("Company size");
  if (!lead.website) missing.push("Company website");
  if (!business.offering.name && !business.offering.description)
    missing.push("What you sell (Sales settings → Offering)");
  return missing.slice(0, 6);
}

function firstSentence(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0]!.trim();
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/** One line on what we offer, from the company's own words (never invented). */
function valueLine(input: SalesCopilotInput): string {
  const { offering, valueProposition } = input.business;
  if (valueProposition.problemSolved) return firstSentence(valueProposition.problemSolved);
  if (offering.name && offering.description) {
    const description = firstSentence(offering.description);
    return `We offer ${offering.name.toLowerCase()} — ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
  }
  if (offering.description) return firstSentence(offering.description);
  return valueProposition.whyBuy ? firstSentence(valueProposition.whyBuy) : "";
}

function draftEmail(input: SalesCopilotInput): NonNullable<SalesCopilotAnswer["draft"]> {
  const { lead, business, userName } = input;
  const greetingName =
    lead.firstName ?? (lead.fullName.includes("@") ? null : lead.fullName.split(" ")[0]);
  const place = [lead.city, lead.country].filter(Boolean)[0] ?? null;
  // Personalise only with verified record fields.
  // Only verified record fields: company and place. Industry stays out of the prose
  // (free-text values like "Real estate agency" don't read naturally mid-sentence).
  const context = lead.companyName
    ? `I came across ${lead.companyName}${place ? ` in ${place}` : ""} and wanted to reach out.`
    : "";
  const value =
    valueLine(input) ||
    (business.offering.name
      ? `We offer ${business.offering.name}.`
      : "I'd like to share how we help teams like yours.");
  const outcome = business.valueProposition.outcomes[0];
  const body = [
    `Hi ${greetingName ?? "there"},`,
    "",
    [context, value].filter(Boolean).join(" "),
    outcome ? `Our customers typically see: ${outcome.replace(/\.$/, "")}.` : null,
    "",
    "Would you be open to a quick 15-minute conversation next week?",
    "",
    "Best,",
    userName,
    business.companyName || null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const subject = lead.companyName
    ? `Quick idea for ${lead.companyName}`
    : `Quick question${greetingName ? `, ${greetingName}` : ""}`;
  return { channel: "EMAIL", subject, body };
}

export class DemoSalesAI implements SalesAI {
  research(input: ResearchInput, _meta?: AiCallMeta): Promise<AiResult<LeadResearchResult>> {
    return Promise.resolve({
      data: demoResearch(input),
      promptVersion: SALES_RESEARCH_PROMPT_VERSION,
      provider: this.providerName,
      model: this.modelName,
    });
  }

  generateOutreach(input: OutreachInput, _meta?: AiCallMeta): Promise<AiResult<OutreachDraft>> {
    return Promise.resolve({
      data: demoOutreach(input),
      promptVersion: SALES_OUTREACH_PROMPT_VERSION,
      provider: this.providerName,
      model: this.modelName,
    });
  }

  analyzeConversation(
    input: AnalyzeConversationInput,
    _meta?: AiCallMeta,
  ): Promise<AiResult<ConversationAnalysis>> {
    return Promise.resolve({
      data: demoAnalyzeConversation(input),
      promptVersion: SALES_ANALYSIS_PROMPT_VERSION,
      provider: this.providerName,
      model: this.modelName,
    });
  }

  readonly providerName = "demo";
  readonly modelName = "demo-sales-heuristics";
  readonly discoveryMode = "demo" as const;
  readonly canReason = false;

  private rules<T>(data: T): Promise<AiResult<T>> {
    return Promise.resolve({
      data,
      promptVersion: SALES_PROSPECTING_PROMPT_VERSION,
      provider: this.providerName,
      model: "keyword-rules",
    });
  }

  planProspectSearch(input: ProspectPlanInput, _meta?: AiCallMeta) {
    return this.rules(rulesPlan(input));
  }

  readListingPage(input: ReadListingInput, _meta?: AiCallMeta) {
    return this.rules(rulesReadListing(input));
  }

  assessProspects(input: AssessProspectsInput, _meta?: AiCallMeta) {
    return this.rules(rulesAssess(input));
  }

  discoverProspects(
    input: DiscoverProspectsInput,
    _meta?: AiCallMeta,
  ): Promise<AiResult<ProspectDiscovery>> {
    return Promise.resolve({
      data: demoDiscoverProspects(input),
      promptVersion: SALES_DISCOVERY_PROMPT_VERSION,
      provider: this.providerName,
      model: this.modelName,
    });
  }

  async copilot(
    input: SalesCopilotInput,
    _meta?: AiCallMeta,
  ): Promise<AiResult<SalesCopilotAnswer>> {
    const { lead } = input;
    const type = classify(input.question);
    const actions = leadActions(lead);
    const facts = verifiedFacts(lead);
    const missing = missingInformation(input);
    const injected = detectPromptInjection(lead.notes ?? "");
    const confidence =
      Math.round(Math.max(0.2, Math.min(0.85, (lead.scoreConfidence ?? 0) * 0.8 + 0.1)) * 100) /
      100;
    const q = lead.qualification;
    let answer: string;
    let draft: SalesCopilotAnswer["draft"] = null;

    if (lead.status === "DO_NOT_CONTACT") {
      answer = `${lead.fullName} opted out of contact. Don't send any outreach; keep the record only for compliance.`;
    } else {
      switch (type) {
        case "DRAFT_MESSAGE":
          draft = draftEmail(input);
          answer = `Here's a short first email using only details from the lead record${lead.industry ? "" : " (add their industry or a verified observation to make it more specific)"}. Review it before sending — nothing is sent automatically.`;
          break;
        case "QUALIFICATION":
          answer = q
            ? `${q.status === "QUALIFIED" ? "Yes — this lead fits your profile." : q.status === "UNQUALIFIED" ? "Not currently a fit." : "Not enough information to decide yet."} ${q.reason}${q.failed.length ? ` Failed: ${q.failed.join("; ")}.` : ""}${q.unknown.length ? ` Unknown: ${q.unknown.join("; ")}.` : ""}`
            : "This lead hasn't been scored yet. Score it to check it against your qualification rules.";
          break;
        case "SUMMARY":
          answer = `${lead.fullName}${lead.jobTitle ? `, ${lead.jobTitle}` : ""}${lead.companyName ? ` at ${lead.companyName}` : ""}. Status: ${lead.status.toLowerCase().replace(/_/g, " ")}. ${lead.leadScore !== null ? `Score ${lead.leadScore}/100 (${lead.scoreBand}).` : "Not scored."} ${input.recentActivity.length > 0 ? `Latest activity: ${input.recentActivity[0]!.summary}.` : "No activity recorded yet."}`;
          break;
        case "OBJECTION":
          answer =
            "No objections are recorded for this lead yet. Once a conversation is logged, I can identify and help you respond to objections.";
          break;
        case "APPROACH": {
          const strengths = lead.factors
            .filter((f) => (f.score ?? 0) >= 75)
            .map((f) => f.label.toLowerCase());
          answer = `${strengths.length > 0 ? `Lead with what fits: ${strengths.join(", ")}.` : "Fit signals are weak or unknown, so start by confirming their needs."} ${valueLine(input) ? `Anchor on your core value: ${valueLine(input)}` : "Add your value proposition in Sales settings so I can tailor the angle."} Keep the first message short and ask one question.`;
          break;
        }
        default:
          answer =
            actions.length > 0
              ? `Recommended next step: ${actions[0]!.action.toLowerCase().replace(/_/g, " ")} — ${actions[0]!.reason}`
              : "No action is needed right now.";
      }
    }
    if (injected)
      answer += " Note: this lead's notes contain instructions aimed at the AI; they were ignored.";
    if (input.business.language !== "en") answer += " (Demo mode answers in English.)";

    const data = salesCopilotAnswerSchema.parse({
      questionType: type,
      answer,
      draft,
      recommendedActions: actions,
      facts,
      missingInformation: missing,
      confidence,
    });
    return {
      data,
      promptVersion: SALES_COPILOT_PROMPT_VERSION,
      provider: this.providerName,
      model: this.modelName,
    };
  }
}
