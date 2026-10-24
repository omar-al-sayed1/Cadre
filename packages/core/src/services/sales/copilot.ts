import { LLMError, type SalesCopilotAnswer } from "@repo/ai";
import { AppError, logger } from "@repo/shared";
import { salesCopilotSchema } from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../../audit";
import type { ActorContext } from "../../context";
import { rateLimit } from "../../rate-limit";
import { getSalesAI } from "../../runtime";
import { assertSalesAiQuota, requireSales } from "./access";
import { listSalesActivity, recordSalesActivity, SALES_ACTIVITY } from "./activity";
import { loadSalesConfig } from "./agent";
import { getLeadRecommendations, toBusinessContext, toLeadContext } from "./context";
import { getLead } from "./leads";

/**
 * "Ask Sales AI" (spec §26). The assistant sees only this workspace's
 * configuration and this one lead. Its answer is advice: nothing is changed or
 * sent as a result of a copilot call.
 */

export interface CopilotExchange {
  id: string;
  question: string;
  answer: SalesCopilotAnswer;
  askedBy: string | null;
  createdAt: string;
}

export async function askSalesCopilot(
  ctx: ActorContext,
  leadId: string,
  rawInput: unknown,
): Promise<CopilotExchange> {
  await requireSales(ctx, "sales.ai");
  const { question } = salesCopilotSchema.parse(rawInput);
  await rateLimit("aiGeneration", `sales-copilot:${ctx.userId}`);
  await assertSalesAiQuota(ctx.companyId);
  const lead = await getLead(ctx, leadId);
  const [config, activity] = await Promise.all([
    loadSalesConfig(ctx.companyId),
    listSalesActivity(ctx, { leadId, limit: 15 }),
  ]);
  const input = {
    business: toBusinessContext(config, ctx.userName),
    lead: toLeadContext(lead, await getLeadRecommendations(ctx.companyId, lead)),
    recentActivity: activity
      .filter((a) => a.type !== SALES_ACTIVITY.aiCopilotAnswered)
      .slice(0, 10)
      .map((a) => ({ at: a.createdAt.slice(0, 16).replace("T", " "), summary: a.summary })),
    question,
    userName: ctx.userName,
  };
  try {
    const result = await getSalesAI().copilot(input, {
      companyId: ctx.companyId,
      userId: ctx.userId,
    });
    const createdAt = new Date();
    await recordSalesActivity({
      companyId: ctx.companyId,
      leadId,
      actorType: "AI",
      type: SALES_ACTIVITY.aiCopilotAnswered,
      summary: `AI answered: “${question.slice(0, 120)}${question.length > 120 ? "…" : ""}”`,
      metadata: {
        question,
        answer: result.data,
        askedBy: ctx.userId,
        askedByName: ctx.userName,
        promptVersion: result.promptVersion,
        model: result.model,
      },
    });
    await audit(ctx, {
      action: AUDIT_ACTIONS.salesAiRequested,
      entityType: "sales_lead",
      entityId: leadId,
      metadata: { operation: "SALES_COPILOT", questionType: result.data.questionType },
    });
    return {
      id: `${leadId}:${createdAt.getTime()}`,
      question,
      answer: result.data,
      askedBy: ctx.userName,
      createdAt: createdAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn("sales.copilot_failed", {
      kind: error instanceof LLMError ? error.kind : "unknown",
    });
    await recordSalesActivity({
      companyId: ctx.companyId,
      leadId,
      actorType: "AI",
      type: SALES_ACTIVITY.aiCopilotFailed,
      summary: "Sales AI couldn't answer (temporarily unavailable)",
      metadata: { question },
    });
    throw new AppError("AI_UNAVAILABLE", {
      message: "Sales AI is unavailable right now. Please try again in a moment.",
    });
  }
}

/** Previous copilot exchanges for a lead (stored in the activity log). */
export async function listCopilotHistory(
  ctx: ActorContext,
  leadId: string,
): Promise<CopilotExchange[]> {
  const activity = await listSalesActivity(ctx, { leadId, limit: 50 });
  return activity
    .filter(
      (a) =>
        a.type === SALES_ACTIVITY.aiCopilotAnswered &&
        a.metadata.answer &&
        typeof a.metadata.question === "string",
    )
    .map((a) => ({
      id: a.id,
      question: a.metadata.question as string,
      answer: a.metadata.answer as SalesCopilotAnswer,
      askedBy: typeof a.metadata.askedByName === "string" ? a.metadata.askedByName : null,
      createdAt: a.createdAt,
    }))
    .reverse();
}
