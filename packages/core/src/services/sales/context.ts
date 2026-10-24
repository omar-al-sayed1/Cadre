import type { SalesBusinessContext, SalesLeadContext } from "@repo/ai";
import { db } from "@repo/database";
import { recommendNextActions, type Recommendation } from "@repo/sales-engine";
import type { SalesAgentConfig } from "@repo/validation";
import type { LeadView } from "./leads";

/**
 * What the AI may see: the company's sales profile and one lead. Built here so
 * every sales AI call gets the same, tenant-scoped view.
 */
export function toBusinessContext(
  config: SalesAgentConfig,
  fallbackCompanyName: string,
): SalesBusinessContext {
  return {
    companyName: config.company.name || fallbackCompanyName,
    companyDescription: config.company.description,
    website: config.company.website,
    offering: config.offering,
    icp: {
      industries: config.icp.industries,
      companySizes: config.icp.companySizes,
      countries: config.icp.countries,
      cities: config.icp.cities,
      jobTitles: config.icp.jobTitles,
      characteristics: config.icp.characteristics,
    },
    valueProposition: config.valueProposition,
    qualificationNotes: config.qualification.notes,
    tone: config.tone,
    language: config.behavior.language,
    matchProspectLanguage: config.behavior.matchProspectLanguage,
    responseLength: config.behavior.responseLength,
    discloseAutomation: config.behavior.discloseAutomation,
    playbook: config.playbook,
  };
}

export function toLeadContext(
  lead: LeadView,
  recommendations: Recommendation[] = [],
): SalesLeadContext {
  return {
    fullName: lead.fullName,
    firstName: lead.firstName,
    companyName: lead.companyName,
    jobTitle: lead.jobTitle,
    hasEmail: Boolean(lead.email),
    hasPhone: Boolean(lead.phone),
    website: lead.website,
    linkedinUrl: lead.linkedinUrl,
    industry: lead.industry,
    city: lead.city,
    country: lead.country,
    location: lead.location,
    companySize: lead.companySize,
    status: lead.status,
    source: lead.source,
    notes: lead.notes,
    tags: lead.tags,
    leadScore: lead.leadScore,
    scoreBand: lead.score?.band ?? null,
    scoreConfidence: lead.score?.confidence ?? null,
    qualification: lead.score?.qualification ?? null,
    factors: (lead.score?.factors ?? []).map((f) => ({
      label: f.label,
      score: f.score,
      reason: f.reason,
    })),
    lastContactedAt: lead.lastContactedAt,
    createdAt: lead.createdAt,
    recommendations,
  };
}

interface StoredAnalysis {
  intent?: string;
  escalate?: boolean;
  requestedInformation?: string[];
  objections?: Array<{ text?: string }>;
}

/** Deterministic next-best actions for a lead (spec §29). Caller must have authorised access to the lead. */
export async function getLeadRecommendations(
  companyId: string,
  lead: LeadView,
): Promise<Recommendation[]> {
  const [research, lastInbound, lastOutbound] = await Promise.all([
    db.salesLeadResearch.findFirst({
      where: { companyId, leadId: lead.id },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    db.salesMessage.findFirst({
      where: { companyId, direction: "INBOUND", conversation: { leadId: lead.id } },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, analysis: true },
    }),
    db.salesMessage.findFirst({
      where: {
        companyId,
        direction: "OUTBOUND",
        status: { in: ["SENT", "LOGGED"] },
        conversation: { leadId: lead.id },
      },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
  ]);
  // Stored as { analysis: ConversationAnalysis, model, promptVersion } (see messaging.ts).
  const analysis = ((lastInbound?.analysis as { analysis?: StoredAnalysis } | null)?.analysis ??
    null) as StoredAnalysis | null;
  return recommendNextActions({
    status: lead.status,
    hasEmail: Boolean(lead.email),
    hasPhone: Boolean(lead.phone),
    lastContactedAt: lead.lastContactedAt ? new Date(lead.lastContactedAt) : null,
    nextFollowUpAt: lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null,
    qualification: lead.score?.qualification
      ? { status: lead.score.qualification.status, reason: lead.score.qualification.reason }
      : null,
    dataConfidence: lead.score?.confidence ?? 0,
    research: !research
      ? "none"
      : research.status === "COMPLETED"
        ? "completed"
        : research.status === "FAILED"
          ? "failed"
          : "running",
    lastInbound: lastInbound
      ? {
          at: lastInbound.occurredAt,
          intent: analysis?.intent ?? "UNKNOWN",
          escalate: Boolean(analysis?.escalate),
          requestedInformation: analysis?.requestedInformation ?? [],
          objections: (analysis?.objections ?? []).map((o) => o.text ?? "").filter(Boolean),
        }
      : null,
    lastOutboundAt: lastOutbound?.occurredAt ?? null,
  });
}
