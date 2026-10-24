import { LLMError, type LeadResearchResult, leadResearchSchema } from "@repo/ai";
import { getServerEnv } from "@repo/config/env";
import { asJson, db } from "@repo/database";
import { jobQueue } from "@repo/queue";
import { AppError, logger, type ResearchStatus } from "@repo/shared";
import type { ActorContext } from "../../context";
import { rateLimit } from "../../rate-limit";
import { getSalesAI } from "../../runtime";
import { assertSalesAiQuota, requireSales, requireSalesRead } from "./access";
import { recordSalesActivity, SALES_ACTIVITY } from "./activity";
import { loadSalesConfig } from "./agent";
import { aiChangeLeadStatus } from "./automation";
import { toBusinessContext, toLeadContext } from "./context";
import { getLead, scoreColumns, toLeadView } from "./leads";
import { createResearchProvider } from "./research-providers";

/**
 * Lead research (spec §12). Runs in the background: a ResearchProvider gathers
 * permitted sources, the AI turns them into labelled facts, and the platform
 * stores the result as advice. Research never edits the lead's fields; it only
 * feeds `problemRelevance` into the score and may let the AI qualify a NEW
 * lead when the evidence is strong.
 */

export interface ResearchView {
  id: string;
  status: ResearchStatus;
  provider: string;
  result: LeadResearchResult | null;
  sources: Array<{ url: string; title: string | null }>;
  notes: string[];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

function toView(r: {
  id: string;
  status: ResearchStatus;
  provider: string;
  result: unknown;
  sources: unknown;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): ResearchView {
  const parsed = r.result
    ? leadResearchSchema.safeParse((r.result as { research?: unknown }).research)
    : null;
  const notes =
    r.result && Array.isArray((r.result as { notes?: unknown }).notes)
      ? ((r.result as { notes: string[] }).notes ?? [])
      : [];
  return {
    id: r.id,
    status: r.status,
    provider: r.provider,
    result: parsed?.success ? parsed.data : null,
    sources: Array.isArray(r.sources)
      ? (r.sources as Array<{ url: string; title: string | null }>)
      : [],
    notes,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}

/** Queue research for a lead (idempotent while a run is in progress). */
export async function requestLeadResearch(
  ctx: ActorContext,
  leadId: string,
): Promise<ResearchView> {
  await requireSales(ctx, "sales.ai");
  const lead = await getLead(ctx, leadId);
  const running = await db.salesLeadResearch.findFirst({
    where: { companyId: ctx.companyId, leadId: lead.id, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (running) return toView(running);
  await rateLimit("aiGeneration", `sales-research:${ctx.companyId}`);
  await assertSalesAiQuota(ctx.companyId);
  const research = await db.salesLeadResearch.create({
    data: {
      companyId: ctx.companyId,
      leadId: lead.id,
      status: "QUEUED",
      provider: getServerEnv().RESEARCH_PROVIDER,
      requestedById: ctx.userId,
    },
  });
  await jobQueue.enqueue(
    "sales.research-lead",
    { researchId: research.id },
    { uniqueKey: `sales-research:${research.id}`, maxAttempts: 1 },
  );
  return toView(research);
}

/** Background job body. Never throws for expected failures — the run is marked FAILED with a user-safe reason. */
export async function runLeadResearch(researchId: string): Promise<ResearchView> {
  const claimed = await db.salesLeadResearch.updateMany({
    where: { id: researchId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  const research = await db.salesLeadResearch.findUniqueOrThrow({ where: { id: researchId } });
  if (claimed.count === 0) return toView(research);
  const lead = await db.salesLead.findFirst({
    where: { id: research.leadId, companyId: research.companyId, deletedAt: null },
    include: { owner: { select: { id: true, name: true } } },
  });
  if (!lead) {
    return toView(
      await db.salesLeadResearch.update({
        where: { id: researchId },
        data: { status: "FAILED", error: "The lead no longer exists.", completedAt: new Date() },
      }),
    );
  }
  const fail = async (message: string) => {
    await recordSalesActivity({
      companyId: lead.companyId,
      leadId: lead.id,
      actorType: "AI",
      type: SALES_ACTIVITY.aiResearchFailed,
      summary: `Research unavailable — ${message}`,
    });
    return toView(
      await db.salesLeadResearch.update({
        where: { id: researchId },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      }),
    );
  };

  try {
    const [config, company] = await Promise.all([
      loadSalesConfig(lead.companyId),
      db.company.findUniqueOrThrow({ where: { id: lead.companyId }, select: { name: true } }),
    ]);
    const provider = createResearchProvider(research.provider === "website" ? "website" : "none");
    const gathered = await provider.gather({
      website: lead.website,
      companyName: lead.companyName,
    });
    const view = toLeadView(lead);
    const result = await getSalesAI().research(
      {
        business: toBusinessContext(config, company.name),
        lead: toLeadContext(view),
        sources: gathered.sources.map((s) => ({
          url: s.url,
          title: s.title,
          description: s.description,
          text: s.text,
        })),
        sourceNotes: gathered.notes,
      },
      { companyId: lead.companyId, userId: research.requestedById },
    );
    const data = result.data;
    const completed = await db.salesLeadResearch.update({
      where: { id: researchId },
      data: {
        status: "COMPLETED",
        result: asJson({ research: data, notes: gathered.notes }),
        sources: asJson(
          gathered.sources.map((s) => ({ url: s.url, title: s.title, fetchedAt: s.fetchedAt })),
        ),
        model: result.model,
        promptVersion: result.promptVersion,
        completedAt: new Date(),
      },
    });
    // Research feeds the score (problem relevance); it never overwrites the lead's own fields.
    const rescored = await db.salesLead.update({
      where: { id: lead.id },
      data: {
        problemRelevance: data.problemRelevance,
        ...scoreColumns({ ...lead, problemRelevance: data.problemRelevance }, config),
      },
      include: { owner: { select: { id: true, name: true } } },
    });
    await recordSalesActivity({
      companyId: lead.companyId,
      leadId: lead.id,
      actorType: "AI",
      type: SALES_ACTIVITY.aiResearched,
      summary: `AI researched ${lead.companyName ?? lead.fullName}${gathered.sources.length ? ` (${gathered.sources.length} page${gathered.sources.length === 1 ? "" : "s"} read)` : " from the lead record"}`,
      metadata: {
        researchId,
        sources: gathered.sources.length,
        problemRelevance: data.problemRelevance,
      },
    });

    // Strong, well-evidenced verdicts on NEW leads are applied by the AI (reversible by people).
    const verdict = toLeadView(rescored).score;
    if (
      rescored.status === "NEW" &&
      verdict &&
      verdict.confidence >= 0.75 &&
      verdict.qualification.status !== "NEEDS_REVIEW"
    ) {
      await aiChangeLeadStatus(
        lead.companyId,
        lead.id,
        verdict.qualification.status === "QUALIFIED" ? "QUALIFIED" : "UNQUALIFIED",
        verdict.qualification.reason,
      );
    }
    return toView(completed);
  } catch (error) {
    logger.warn("sales.research_failed", {
      researchId,
      kind: error instanceof LLMError ? error.kind : "unknown",
    });
    return fail(
      error instanceof LLMError
        ? "the AI service is temporarily unavailable. Try again shortly."
        : "something went wrong. Try again.",
    );
  }
}

export async function getLatestResearch(
  ctx: ActorContext,
  leadId: string,
): Promise<ResearchView | null> {
  requireSalesRead(ctx);
  const lead = await db.salesLead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw new AppError("NOT_FOUND", { message: "Lead not found." });
  const research = await db.salesLeadResearch.findFirst({
    where: { companyId: ctx.companyId, leadId },
    orderBy: { createdAt: "desc" },
  });
  return research ? toView(research) : null;
}
