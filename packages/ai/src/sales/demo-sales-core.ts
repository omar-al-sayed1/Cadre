import { detectPromptInjection } from "../prompts/safety";
import {
  conversationAnalysisSchema,
  leadResearchSchema,
  outreachDraftSchema,
  type ConversationAnalysis,
  type LeadResearchResult,
  type OutreachDraft,
  type ReplyIntent,
  type SourcedFact,
} from "./schemas-core";
import type {
  AnalyzeConversationInput,
  OutreachInput,
  ResearchInput,
  SalesBusinessContext,
  SalesLeadContext,
} from "./types";

/**
 * Deterministic stand-ins for research, outreach and reply analysis (DEMO_MODE
 * and tests). Like the real prompts, they only use the provided data: page
 * text that was actually fetched, the lead record and the company profile.
 */

const LEAD_RECORD = "Lead record";

/** "Property websites" reads mid-sentence as "property websites"; brand names like "Nova Sites" keep their case. */
function inlineName(name: string): string {
  const capitalised = name.split(/\s+/).filter((w) => /^\p{Lu}/u.test(w)).length;
  return capitalised > 1 || /^\p{Lu}{2}/u.test(name)
    ? name
    : name.charAt(0).toLowerCase() + name.slice(1);
}

/** Lowercases a sentence's opening pronoun ("We help…") so it can follow a colon. */
function lowerFirstWord(sentence: string): string {
  return /^(We|Our|They|Their|It|Its|Most|Many|Agencies|Companies|Businesses)\b/.test(sentence)
    ? sentence.charAt(0).toLowerCase() + sentence.slice(1)
    : sentence;
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3),
  );
}

const INDUSTRY_HINTS: Array<[RegExp, string]> = [
  [
    /\b(real estate|realty|properties|property|apartments for (sale|rent)|immobilier|عقارات)\b/i,
    "Real estate",
  ],
  [/\b(restaurant|menu|cuisine|reservations)\b/i, "Restaurant"],
  [/\b(clinic|hospital|medical|patients|dental)\b/i, "Healthcare"],
  [/\b(software|saas|platform|api|developers)\b/i, "Software"],
  [/\b(hotel|resort|rooms|booking)\b/i, "Hospitality"],
  [/\b(law firm|legal services|attorneys|lawyers)\b/i, "Legal services"],
  [/\b(school|university|courses|students)\b/i, "Education"],
];

function matchesAny(value: string, targets: string[]): boolean {
  const v = value.toLowerCase();
  return targets.some((t) => v.includes(t.toLowerCase()) || t.toLowerCase().includes(v));
}

// ───────────────────────────── research ─────────────────────────────

export function demoResearch(input: ResearchInput): LeadResearchResult {
  const { lead, business, sources } = input;
  const page = sources[0] ?? null;
  const allText = sources
    .map((s) => `${s.title ?? ""} ${s.description ?? ""} ${s.text}`)
    .join("\n");

  const industry: SourcedFact | null = lead.industry
    ? { statement: `Industry: ${lead.industry}.`, basis: "VERIFIED", source: LEAD_RECORD }
    : (() => {
        const hit = page ? INDUSTRY_HINTS.find(([re]) => re.test(allText)) : undefined;
        return hit && page
          ? {
              statement: `Appears to be in ${hit[1].toLowerCase()} based on their website.`,
              basis: "INFERRED" as const,
              source: page.url,
            }
          : null;
      })();
  const place = [lead.city, lead.country].filter(Boolean).join(", ") || lead.location;
  const location: SourcedFact | null = place
    ? { statement: `Based in ${place}.`, basis: "VERIFIED", source: LEAD_RECORD }
    : null;
  const size: SourcedFact | null = lead.companySize
    ? { statement: `About ${lead.companySize} employees.`, basis: "VERIFIED", source: LEAD_RECORD }
    : null;
  const decisionMaker: SourcedFact | null = lead.jobTitle
    ? {
        statement: `${lead.fullName} is listed as ${lead.jobTitle}.`,
        basis: "VERIFIED",
        source: LEAD_RECORD,
      }
    : null;

  const personalization: SourcedFact[] = [];
  if (page?.description)
    personalization.push({
      statement: `Their website describes them as: “${page.description.slice(0, 180)}”`,
      basis: "VERIFIED",
      source: page.url,
    });
  else if (page?.title)
    personalization.push({
      statement: `Website title: “${page.title}”.`,
      basis: "VERIFIED",
      source: page.url,
    });

  const industryText = industry?.statement ?? "";
  const icpIndustryMatch =
    business.icp.industries.length > 0 &&
    industryText !== "" &&
    matchesAny(industryText.replace(/^.*?:\s*|\.$/g, ""), business.icp.industries);
  const offerWords = words(
    [
      business.offering.name,
      business.offering.description,
      ...business.offering.features,
      ...business.offering.benefits,
      business.valueProposition.problemSolved,
    ].join(" "),
  );
  const pageWords = words(allText);
  const overlap = [...offerWords].filter((w) => pageWords.has(w)).length;

  let problemRelevance: number | null = null;
  if (industry || page) {
    problemRelevance = (icpIndustryMatch ? 60 : industry ? 25 : 40) + Math.min(25, overlap * 5);
  }
  const problem = business.valueProposition.problemSolved || business.valueProposition.whyBuy;
  const potentialProblems: SourcedFact[] =
    problem && icpIndustryMatch
      ? [
          {
            statement: `May face the problem you solve: ${lowerFirstWord(problem).replace(/\.$/, "")}.`,
            basis: "INFERRED",
            source: industry?.source ?? null,
          },
        ]
      : [];
  const potentialNeeds: SourcedFact[] =
    business.offering.name && icpIndustryMatch
      ? [
          {
            statement: `Could benefit from ${inlineName(business.offering.name)}.`,
            basis: "INFERRED",
            source: industry?.source ?? null,
          },
        ]
      : [];

  const unknowns: string[] = [];
  if (!industry) unknowns.push("Industry");
  if (!size) unknowns.push("Company size");
  if (!decisionMaker) unknowns.push("Decision maker");
  if (!page) unknowns.push(lead.website ? "Website content (couldn't be fetched)" : "Website");

  const notes = business.qualificationNotes;
  const injected = detectPromptInjection(allText);
  const summary = page
    ? `${lead.companyName ?? lead.fullName}${page.description ? `: ${page.description.slice(0, 300)}` : ` (website: ${page.url})`}${injected ? " Note: the website contained instructions aimed at AI tools; they were ignored." : ""}`
    : `${lead.companyName ?? lead.fullName}${place ? `, ${place}` : ""}. No website content was available; this summary uses the lead record only.`;
  const known = [industry, location, size, decisionMaker].filter(Boolean).length + (page ? 2 : 0);

  return leadResearchSchema.parse({
    companySummary: summary.slice(0, 1_200),
    industry,
    productsServices: [],
    companySizeEstimate: size,
    location,
    potentialProblems,
    potentialNeeds,
    possibleDecisionMaker: decisionMaker,
    personalizationPoints: personalization,
    salesOpportunity: icpIndustryMatch
      ? `Matches your target industry${problem ? ` and may have the problem you solve` : ""}. Confirm their current setup before pitching.`
      : industry
        ? "Outside your target industries based on available information — review before investing time."
        : "Not enough information to assess the opportunity yet.",
    problemRelevance: problemRelevance === null ? null : Math.min(100, problemRelevance),
    qualificationNotesAssessment: notes
      ? { meets: null, reason: "Demo mode can't check free-text criteria; review them manually." }
      : null,
    unknowns,
    confidence: Math.round(Math.min(0.85, 0.15 + known * 0.1) * 100) / 100,
  });
}

// ───────────────────────────── outreach ─────────────────────────────

function firstSentence(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0]!.trim();
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function valueLine(b: SalesBusinessContext): string {
  if (b.valueProposition.problemSolved) return firstSentence(b.valueProposition.problemSolved);
  if (b.offering.name && b.offering.description) {
    const d = firstSentence(b.offering.description);
    return `We offer ${inlineName(b.offering.name)} — ${d.charAt(0).toLowerCase()}${d.slice(1)}`;
  }
  return b.offering.description
    ? firstSentence(b.offering.description)
    : b.valueProposition.whyBuy
      ? firstSentence(b.valueProposition.whyBuy)
      : "";
}

function greetingName(lead: SalesLeadContext): string {
  return (
    lead.firstName ??
    (lead.fullName.includes("@") ? "there" : (lead.fullName.split(" ")[0] ?? "there"))
  );
}

export function demoOutreach(input: OutreachInput): OutreachDraft {
  const { lead, business, type } = input;
  const name = greetingName(lead);
  const company = lead.companyName;
  const place = [lead.city, lead.country].filter(Boolean)[0] ?? null;
  const verifiedPoint =
    input.research?.personalizationPoints.find(
      (p) => p.basis === "VERIFIED" && p.source && p.source !== LEAD_RECORD,
    ) ?? null;
  const sources: SourcedFact[] = [];
  if (company)
    sources.push({ statement: `Company: ${company}`, basis: "VERIFIED", source: LEAD_RECORD });
  if (place)
    sources.push({ statement: `Location: ${place}`, basis: "VERIFIED", source: LEAD_RECORD });

  const value =
    valueLine(business) || (business.offering.name ? `We offer ${business.offering.name}.` : "");
  const signature = [input.senderName, business.companyName].filter(Boolean).join("\n");
  const short = type === "SMS" || type === "WHATSAPP" || type === "LINKEDIN_MESSAGE";
  let opening = "";
  let personalization = "";
  let cta = "Would you be open to a quick 15-minute call next week?";
  let subject: string | null = null;

  switch (type) {
    case "COLD_EMAIL":
    case "LINKEDIN_MESSAGE":
    case "SMS":
    case "WHATSAPP":
      opening = `Hi ${name},`;
      personalization = company
        ? `I came across ${company}${place ? ` in ${place}` : ""} and wanted to reach out.`
        : "";
      if (verifiedPoint) {
        sources.push(verifiedPoint);
      }
      subject = short ? null : company ? `Quick idea for ${company}` : `Quick question, ${name}`;
      if (short) cta = "Open to a short call this week?";
      break;
    case "FOLLOW_UP":
      opening = `Hi ${name},`;
      personalization = "Following up on my earlier note in case it got buried.";
      subject = company ? `Re: quick idea for ${company}` : "Following up";
      cta = "Worth a quick conversation, or should I close the loop?";
      break;
    case "RE_ENGAGEMENT":
      opening = `Hi ${name},`;
      personalization = "It's been a while since we last spoke, so I wanted to check in.";
      subject = "Checking in";
      cta = "Would it be useful to reconnect for 15 minutes?";
      break;
    case "MEETING_CONFIRMATION":
      opening = `Hi ${name},`;
      personalization = "Thanks for making time to talk.";
      subject = "Confirming our call";
      cta = "Let me know if anything changes on your side.";
      break;
    case "PROPOSAL_FOLLOW_UP":
      opening = `Hi ${name},`;
      personalization = "I wanted to follow up on the proposal we sent.";
      subject = "Following up on our proposal";
      cta = "Happy to answer any questions — would a short call help?";
      break;
    case "POST_MEETING_FOLLOW_UP":
      opening = `Hi ${name},`;
      personalization = "Thank you for the conversation.";
      subject = "Thanks for your time";
      cta = "Let me know the best next step on your side.";
      break;
  }
  const body = [
    opening,
    "",
    [personalization, type === "COLD_EMAIL" || short ? value : ""].filter(Boolean).join(" "),
    "",
    cta,
    "",
    short ? input.senderName : `Best,\n${signature}`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const reviewNotes: string[] = [];
  if (input.language !== "en")
    reviewNotes.push("Demo mode writes in English — translate before sending.");
  if (type === "MEETING_CONFIRMATION") reviewNotes.push("Add the agreed date and time.");
  if (type === "POST_MEETING_FOLLOW_UP")
    reviewNotes.push("Add the next steps you agreed in the meeting.");
  if (!value && (type === "COLD_EMAIL" || short))
    reviewNotes.push("Describe your offering in Sales settings so drafts can explain what you do.");

  return outreachDraftSchema.parse({
    subject,
    opening,
    personalization,
    valueProposition: value,
    callToAction: cta,
    signature: short ? input.senderName : signature,
    body: short ? body.slice(0, type === "LINKEDIN_MESSAGE" || type === "SMS" ? 300 : 500) : body,
    personalizationSources: sources.slice(0, 6),
    reviewNotes,
    language: "en",
  });
}

// ───────────────────────────── reply analysis ─────────────────────────────

const INTENT_RULES: Array<[ReplyIntent, RegExp]> = [
  [
    "UNSUBSCRIBE",
    /\b(unsubscribe|remove me|take me off|stop (emailing|messaging|contacting)|don'?t (contact|email|message) me|opt[- ]?out|désabonner|ne plus (me )?contacter|retirez-moi|الغاء الاشتراك|لا تراسلني)\b/i,
  ],
  [
    "OUT_OF_OFFICE",
    /\b(out of (the )?office|on (annual )?leave|auto(matic)?[- ]?reply|currently away|absent du bureau)\b/i,
  ],
  [
    "WRONG_PERSON",
    /\b(not the right person|wrong person|i'?m not responsible|contact my colleague|not my (area|department))\b/i,
  ],
  [
    "MEETING_REQUEST",
    /\b(let'?s (talk|meet|schedule|book)|book a (call|meeting|demo)|schedule a (call|meeting|demo)|available (on|for|this|next)|free (on|tomorrow|this)|can we (talk|meet|have a call)|set up a (call|meeting))\b/i,
  ],
  [
    "PRICE_REQUEST",
    /\b(pric(e|es|ing)|cost|how much|quote|rates|budget|tarif|prix|كم السعر|الأسعار)\b/i,
  ],
  [
    "NOT_INTERESTED",
    /\b(not interested|no thanks|no thank you|we'?re (all )?set|pas intéressé|غير مهتم)\b/i,
  ],
  [
    "LATER",
    /\b(later|next (month|quarter|year)|not (right )?now|in a few (weeks|months)|after (the )?(summer|holidays))\b/i,
  ],
  [
    "OBJECTION",
    /\b(too expensive|already (have|work with|use)|no budget|not a priority|happy with (our|the) current)\b/i,
  ],
  [
    "INTERESTED",
    /\b(interested|sounds (good|great|interesting)|tell me more|i'?d like to (know|learn)|let'?s (go ahead|proceed|do it)|we'?d like to (proceed|go ahead)|send (over )?the (contract|agreement)|intéressé|مهتم)\b/i,
  ],
];

const OBJECTION_RULES: Array<[ConversationAnalysis["objections"][number]["category"], RegExp]> = [
  ["PRICE", /\b(too expensive|expensive|no budget|cost too)\b/i],
  ["EXISTING_PROVIDER", /\b(already (have|work with|use)|current (provider|agency|supplier))\b/i],
  ["TIMING", /\b(not (right )?now|later|busy|next (month|quarter|year))\b/i],
  ["NO_NEED", /\b(don'?t need|no need|not a priority)\b/i],
  ["AUTHORITY", /\b(discuss with my (partner|boss|team)|not my decision|need approval)\b/i],
];

const INFO_RULES: Array<[RegExp, string]> = [
  [/\b(pric(e|es|ing)|cost|how much|quote)\b/i, "Pricing"],
  [/\b(case stud(y|ies)|examples?|portfolio|references?)\b/i, "Examples or case studies"],
  [/\b(brochure|deck|information|details|more info)\b/i, "More information"],
  [/\b(timeline|how long|when can)\b/i, "Timeline"],
  [/\b(demo|trial)\b/i, "A demo"],
];

const INTENT_SCORE: Record<ReplyIntent, number> = {
  MEETING_REQUEST: 90,
  PRICE_REQUEST: 75,
  INTERESTED: 70,
  QUESTION: 50,
  OBJECTION: 35,
  LATER: 30,
  OUT_OF_OFFICE: 20,
  WRONG_PERSON: 15,
  UNKNOWN: 20,
  NOT_INTERESTED: 5,
  UNSUBSCRIBE: 0,
};

const INTENT_SUMMARY: Record<ReplyIntent, string> = {
  MEETING_REQUEST: "Asked to set up a meeting",
  PRICE_REQUEST: "Asked about pricing",
  INTERESTED: "Showed interest",
  QUESTION: "Asked a question",
  OBJECTION: "Raised a concern",
  LATER: "Asked to talk later",
  OUT_OF_OFFICE: "Automatic out-of-office reply",
  WRONG_PERSON: "Said they're not the right contact",
  NOT_INTERESTED: "Said they're not interested",
  UNSUBSCRIBE: "Asked to be removed from the list",
  UNKNOWN: "Reply with no clear intent",
};

function detectLanguage(text: string): ConversationAnalysis["language"] {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/\b(bonjour|merci|nous|vous|est-ce|intéress|cordialement)\b/i.test(text)) return "fr";
  if (/\b(the|and|you|we|thanks|hi|hello|please)\b/i.test(text)) return "en";
  return "other";
}

export function demoAnalyzeConversation(input: AnalyzeConversationInput): ConversationAnalysis {
  const text = `${input.message.subject ?? ""}\n${input.message.content}`;
  const intent: ReplyIntent =
    INTENT_RULES.find(([, re]) => re.test(text))?.[0] ??
    (/\?/.test(input.message.content) ? "QUESTION" : "UNKNOWN");
  const objections = OBJECTION_RULES.filter(([, re]) => re.test(text)).map(([category, re]) => ({
    category,
    text: (text.match(re)?.[0] ?? category).trim(),
  }));
  const questions = input.message.content
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((q) => q.trim())
    .filter((q) => /[?؟]$/.test(q) && q.length > 3)
    .slice(0, 5);
  const requested = INFO_RULES.filter(([re]) => re.test(text)).map(([, label]) => label);
  const angry = /\b(stop spamming|harass|spam|report you|lawyer|legal action|gdpr)\b/i.test(text);
  const injected = detectPromptInjection(text);
  const sentiment: ConversationAnalysis["sentiment"] =
    angry || intent === "NOT_INTERESTED" || intent === "UNSUBSCRIBE"
      ? "NEGATIVE"
      : ["INTERESTED", "MEETING_REQUEST", "PRICE_REQUEST"].includes(intent)
        ? "POSITIVE"
        : "NEUTRAL";
  const language = detectLanguage(text);
  const name = greetingName(input.lead);
  const playbookObjection = (cat: string) =>
    input.business.playbook.objections.find((o) =>
      cat === "PRICE"
        ? /expensive|price|cost/i.test(o.objection)
        : cat === "EXISTING_PROVIDER"
          ? /provider|already/i.test(o.objection)
          : cat === "TIMING"
            ? /later|time/i.test(o.objection)
            : false,
    );

  let nextAction: ConversationAnalysis["nextAction"];
  let suggestedReply: string | null = null;
  const sign = `\n\nBest,\n${input.business.companyName}`;
  switch (intent) {
    case "UNSUBSCRIBE":
      nextAction = { action: "STOP_OUTREACH", reason: "They asked not to be contacted." };
      break;
    case "OUT_OF_OFFICE":
      nextAction = { action: "WAIT", reason: "Automatic out-of-office reply." };
      break;
    case "MEETING_REQUEST":
      nextAction = { action: "SCHEDULE_CALL", reason: "They asked to meet." };
      suggestedReply = `Hi ${name},\n\nGreat — happy to set up a call. Which day and time work best for you this week?${sign}`;
      break;
    case "PRICE_REQUEST":
      nextAction = { action: "SEND_INFORMATION", reason: "They asked about pricing." };
      suggestedReply = `Hi ${name},\n\nThanks for asking. ${input.business.offering.priceRange ? `Our pricing is typically ${input.business.offering.priceRange}, depending on scope.` : "Pricing depends on scope — I'd be glad to put together a quote."} Would a short call help so I can give you an exact figure?${sign}`;
      break;
    case "INTERESTED":
      nextAction = { action: "SCHEDULE_CALL", reason: "They showed interest." };
      suggestedReply = `Hi ${name},\n\nGlad this caught your interest. Would a 15-minute call this week work to see if it's a fit?${sign}`;
      break;
    case "QUESTION":
      nextAction = { action: "SEND_INFORMATION", reason: "Answer their question." };
      suggestedReply = `Hi ${name},\n\nThanks for the question — [answer here].\n\nHappy to walk you through it on a short call if that's easier.${sign}`;
      break;
    case "OBJECTION": {
      const handling = objections[0] ? playbookObjection(objections[0].category) : undefined;
      nextAction = {
        action: "HANDLE_OBJECTION",
        reason: objections[0] ? `Objection: ${objections[0].text}.` : "They raised a concern.",
      };
      suggestedReply = `Hi ${name},\n\nThanks for being open about that.${handling ? ` [Following your playbook: ${handling.response}]` : ""} Would it be worth a short call to see whether it makes sense for you?${sign}`;
      break;
    }
    case "LATER":
      nextAction = { action: "WAIT", reason: "They asked to talk later." };
      suggestedReply = `Hi ${name},\n\nNo problem at all — I'll reach out again then. Thanks for letting me know.${sign}`;
      break;
    case "WRONG_PERSON":
      nextAction = { action: "ADD_DETAILS", reason: "Find the right contact." };
      suggestedReply = `Hi ${name},\n\nThanks for letting me know. Could you point me to the right person for this?${sign}`;
      break;
    case "NOT_INTERESTED":
      nextAction = { action: "STOP_OUTREACH", reason: "They're not interested." };
      suggestedReply = `Hi ${name},\n\nUnderstood — thanks for letting me know. I won't follow up further.${sign}`;
      break;
    default:
      nextAction = { action: "SEND_INFORMATION", reason: "Reply to their message." };
  }
  const escalate =
    angry ||
    /\b(contract|legal|security|compliance|gdpr|enterprise|procurement)\b/i.test(text) ||
    /\b(speak|talk) to (a )?(human|person|someone)\b/i.test(text);
  if (escalate && nextAction.action !== "STOP_OUTREACH")
    nextAction = {
      action: "ESCALATE_TO_HUMAN",
      reason: "Sensitive or complex message — a person should reply.",
    };
  const asked = requested.filter((r) => !(intent === "PRICE_REQUEST" && r === "Pricing"));
  const summary = `${INTENT_SUMMARY[intent]}${asked.length ? `; wants ${asked.join(", ").toLowerCase()}` : ""}${injected ? "; the message contained instructions aimed at the AI, which were ignored" : ""}.`;

  return conversationAnalysisSchema.parse({
    intent,
    intentScore: INTENT_SCORE[intent],
    sentiment,
    buyingStage:
      intent === "MEETING_REQUEST" || intent === "PRICE_REQUEST"
        ? "EVALUATING"
        : intent === "INTERESTED"
          ? "CONSIDERING"
          : ["NOT_INTERESTED", "UNSUBSCRIBE"].includes(intent)
            ? "NOT_BUYING"
            : "UNKNOWN",
    painPoints: [],
    objections,
    questions,
    requestedInformation: requested,
    urgency: /\b(asap|urgent|today|this week|immediately)\b/i.test(text)
      ? "HIGH"
      : intent === "MEETING_REQUEST" || intent === "PRICE_REQUEST"
        ? "MEDIUM"
        : "LOW",
    language,
    summary,
    nextAction,
    suggestedReply:
      input.business.language !== "en" && suggestedReply
        ? `${suggestedReply}\n\n[Demo mode writes in English — translate before sending.]`
        : suggestedReply,
    escalate,
    confidence: intent === "UNKNOWN" ? 0.3 : 0.7,
  });
}
