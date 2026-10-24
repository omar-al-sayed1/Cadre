import type { LeadStatus } from "@repo/shared";

/**
 * Next-best-action engine (spec §29). Deterministic rules over the lead's
 * state, research and latest reply produce recommendations with reasons; the
 * AI explains and phrases them but never invents actions outside this list.
 * Recommendations are advice — nothing here changes data.
 */
export const RECOMMENDATION_ACTIONS = [
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
export type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number];

export interface Recommendation {
  action: RecommendationAction;
  priority: "high" | "medium" | "low";
  reason: string;
}

export const RECOMMENDATION_LABELS: Record<RecommendationAction, string> = {
  RESEARCH_LEAD: "Research the lead",
  ADD_DETAILS: "Add missing details",
  QUALIFY: "Mark as qualified",
  DISQUALIFY: "Mark as unqualified",
  CONTACT: "Reach out",
  FOLLOW_UP: "Follow up",
  SEND_INFORMATION: "Send the requested information",
  HANDLE_OBJECTION: "Address the objection",
  SCHEDULE_CALL: "Propose a call",
  WAIT: "Wait",
  ESCALATE_TO_HUMAN: "Involve a person",
  STOP_OUTREACH: "Stop outreach",
};

export interface RecommendationContext {
  status: LeadStatus;
  hasEmail: boolean;
  hasPhone: boolean;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  qualification: { status: "QUALIFIED" | "UNQUALIFIED" | "NEEDS_REVIEW"; reason: string } | null;
  /** 0–1 share of relevant scoring data that is known. */
  dataConfidence: number;
  research: "none" | "running" | "completed" | "failed";
  /** Latest analysed inbound message, if any. */
  lastInbound: {
    at: Date;
    intent: string;
    escalate: boolean;
    requestedInformation: string[];
    objections: string[];
  } | null;
  lastOutboundAt: Date | null;
  now?: Date;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

const DORMANT: readonly LeadStatus[] = ["WON", "LOST", "UNQUALIFIED"];

export function recommendNextActions(ctx: RecommendationContext): Recommendation[] {
  const now = ctx.now ?? new Date();
  if (ctx.status === "DO_NOT_CONTACT") {
    return [
      {
        action: "STOP_OUTREACH",
        priority: "high",
        reason: "This lead opted out. Don't contact them on any channel.",
      },
    ];
  }
  const out: Recommendation[] = [];
  const replyIsNewest =
    ctx.lastInbound && (!ctx.lastOutboundAt || ctx.lastInbound.at >= ctx.lastOutboundAt);

  // 1. A reply waiting for us decides almost everything.
  if (ctx.lastInbound && replyIsNewest) {
    const r = ctx.lastInbound;
    if (r.intent === "UNSUBSCRIBE")
      return [
        {
          action: "STOP_OUTREACH",
          priority: "high",
          reason: "The prospect asked not to be contacted.",
        },
      ];
    if (r.escalate)
      out.push({
        action: "ESCALATE_TO_HUMAN",
        priority: "high",
        reason: "The latest reply needs a person (sensitive, complex or low-confidence).",
      });
    switch (r.intent) {
      case "MEETING_REQUEST":
        out.push({
          action: "SCHEDULE_CALL",
          priority: "high",
          reason: "The prospect asked to meet.",
        });
        break;
      case "PRICE_REQUEST":
        out.push({
          action: "SEND_INFORMATION",
          priority: "high",
          reason: "The prospect asked about pricing.",
        });
        break;
      case "QUESTION":
        out.push({
          action: "SEND_INFORMATION",
          priority: "high",
          reason:
            r.requestedInformation.length > 0
              ? `They asked about: ${r.requestedInformation.slice(0, 2).join("; ")}.`
              : "The prospect asked a question.",
        });
        break;
      case "INTERESTED":
        out.push({
          action: "SCHEDULE_CALL",
          priority: "high",
          reason: "The lead shows buying intent — offer a short call.",
        });
        break;
      case "OBJECTION":
        out.push({
          action: "HANDLE_OBJECTION",
          priority: "medium",
          reason: r.objections[0]
            ? `They raised: ${r.objections[0]}.`
            : "The prospect raised an objection.",
        });
        break;
      case "LATER":
        out.push({
          action: "WAIT",
          priority: "low",
          reason: "They asked to talk later — follow up at the time they suggested.",
        });
        break;
      case "OUT_OF_OFFICE":
        out.push({
          action: "WAIT",
          priority: "low",
          reason: "Auto-reply: they're away. Follow up after they return.",
        });
        break;
      case "WRONG_PERSON":
        out.push({
          action: "ADD_DETAILS",
          priority: "medium",
          reason: "Wrong contact — find the right decision maker.",
        });
        break;
      case "NOT_INTERESTED":
        out.push({
          action: "STOP_OUTREACH",
          priority: "medium",
          reason: "They're not interested. Consider closing the lead as lost.",
        });
        break;
      default:
        out.push({
          action: "SEND_INFORMATION",
          priority: "medium",
          reason: "Reply to their latest message.",
        });
    }
    return dedupe(out).slice(0, 3);
  }

  if (DORMANT.includes(ctx.status)) {
    return ctx.status === "UNQUALIFIED"
      ? [
          {
            action: "WAIT",
            priority: "low",
            reason: "Marked as not a fit. Revisit only if their situation changes.",
          },
        ]
      : [];
  }
  if (ctx.status === "PROPOSAL" || ctx.status === "NEGOTIATION") {
    return [
      {
        action: "ESCALATE_TO_HUMAN",
        priority: "high",
        reason: "Pricing and contract terms should be handled by a person.",
      },
    ];
  }

  // 2. Not contacted yet: understand fit before outreach.
  const precontact: readonly LeadStatus[] = ["NEW", "RESEARCHING", "QUALIFIED"];
  if (precontact.includes(ctx.status)) {
    const verdict = ctx.qualification?.status ?? "NEEDS_REVIEW";
    if (ctx.research === "none" && (verdict === "NEEDS_REVIEW" || ctx.dataConfidence < 0.75)) {
      out.push({
        action: "RESEARCH_LEAD",
        priority: "high",
        reason:
          "Research the company before reaching out to confirm fit and find a relevant angle.",
      });
    }
    if (verdict === "UNQUALIFIED") {
      out.push({
        action: "DISQUALIFY",
        priority: "medium",
        reason: `Lead doesn't match your ICP: ${ctx.qualification?.reason ?? ""}`.trim(),
      });
    } else if (verdict === "NEEDS_REVIEW") {
      out.push({
        action: "ADD_DETAILS",
        priority: ctx.research === "completed" ? "high" : "medium",
        reason: ctx.qualification?.reason ?? "Not enough information to judge fit.",
      });
    } else if (ctx.hasEmail || ctx.hasPhone) {
      if (ctx.status !== "QUALIFIED")
        out.push({
          action: "QUALIFY",
          priority: "medium",
          reason: ctx.qualification?.reason ?? "Fits your profile.",
        });
      out.push({
        action: "CONTACT",
        priority: "high",
        reason: "Strong fit and contact details on file.",
      });
    } else {
      out.push({
        action: "ADD_DETAILS",
        priority: "high",
        reason: "Good fit, but no email or phone to contact them.",
      });
    }
    return dedupe(out).slice(0, 3);
  }

  // 3. In conversation, no reply pending.
  if (ctx.nextFollowUpAt && ctx.nextFollowUpAt > now) {
    return [
      {
        action: "WAIT",
        priority: "low",
        reason: `Follow-up scheduled for ${ctx.nextFollowUpAt.toISOString().slice(0, 10)}.`,
      },
    ];
  }
  const lastTouch = ctx.lastOutboundAt ?? ctx.lastContactedAt;
  if (["CONTACTED", "ENGAGED"].includes(ctx.status)) {
    const days = lastTouch ? daysBetween(lastTouch, now) : null;
    if (days === null || days >= 3) {
      out.push({
        action: "FOLLOW_UP",
        priority: days !== null && days >= 7 ? "high" : "medium",
        reason:
          days === null
            ? "No follow-up recorded yet."
            : `No reply for ${days} days — follow up today.`,
      });
    } else {
      out.push({
        action: "WAIT",
        priority: "low",
        reason: `Contacted ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`} — give them time to reply.`,
      });
    }
  }
  if (["INTERESTED", "MEETING_REQUESTED"].includes(ctx.status)) {
    out.push({
      action: "SCHEDULE_CALL",
      priority: "high",
      reason: "The lead is interested — propose a short call.",
    });
  }
  if (ctx.status === "MEETING_BOOKED") {
    out.push({
      action: "WAIT",
      priority: "low",
      reason: "Meeting booked. Prepare and follow up afterwards.",
    });
  }
  return dedupe(out).slice(0, 3);
}

function dedupe(recs: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  return recs.filter((r) => (seen.has(r.action) ? false : (seen.add(r.action), true)));
}
