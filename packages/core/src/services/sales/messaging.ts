import {
  conversationAnalysisSchema,
  LLMError,
  outreachDraftSchema,
  type ConversationAnalysis,
  type ConversationTurn,
  type OutreachDraft,
} from "@repo/ai";
import { brand } from "@repo/config";
import { asJson, db, type SalesMessage } from "@repo/database";
import { AppError, logger, type SalesChannel } from "@repo/shared";
import { generateOutreachSchema, logMessageSchema, updateDraftSchema } from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../../audit";
import { can, type ActorContext } from "../../context";
import { notifyCompanyMembers } from "../../notifications";
import { rateLimit } from "../../rate-limit";
import { getSalesAI } from "../../runtime";
import { assertSalesAiQuota, requireSales, requireSalesRead } from "./access";
import { recordSalesActivity, SALES_ACTIVITY } from "./activity";
import { loadSalesConfig } from "./agent";
import { aiChangeLeadStatus, isSuppressed, suppressLead } from "./automation";
import { getLeadRecommendations, toBusinessContext, toLeadContext } from "./context";
import { changeLeadStatus, getLead, scoreColumns, type LeadView } from "./leads";
import { getLatestResearch } from "./research";

const CHANNEL_NOUN: Record<SalesChannel, string> = {
  EMAIL: "an email",
  LINKEDIN: "a LinkedIn message",
  SMS: "an SMS",
  WHATSAPP: "a WhatsApp message",
  CALL: "a call",
  MEETING: "a meeting",
  OTHER: "a message",
};

/**
 * Conversations, outreach drafts and reply analysis (spec §16–24, §77).
 * In this phase messages are *logged* (pasted in or marked as sent by a
 * person); nothing is sent by Cadre until a mailbox is connected. The AI
 * analyses replies and drafts messages; deterministic rules decide what
 * changes as a result.
 */

export interface MessageView {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  channel: SalesChannel;
  status: SalesMessage["status"];
  messageType: string | null;
  subject: string | null;
  content: string;
  generatedByAi: boolean;
  analysis: ConversationAnalysis | null;
  draft: OutreachDraft | null;
  warnings: string[];
  occurredAt: string;
}

export interface ConversationView {
  id: string;
  channel: SalesChannel;
  subject: string | null;
  lastMessageAt: string;
  messages: MessageView[];
}

function toMessageView(m: SalesMessage): MessageView {
  const meta = (m.analysis ?? {}) as { analysis?: unknown; draft?: unknown; warnings?: unknown };
  const analysis =
    m.direction === "INBOUND" ? conversationAnalysisSchema.safeParse(meta.analysis) : null;
  const draft = m.direction === "OUTBOUND" ? outreachDraftSchema.safeParse(meta.draft) : null;
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    channel: m.channel,
    status: m.status,
    messageType: m.messageType,
    subject: m.subject,
    content: m.content,
    generatedByAi: m.generatedByAi,
    analysis: analysis?.success ? analysis.data : null,
    draft: draft?.success ? draft.data : null,
    warnings: Array.isArray(meta.warnings) ? (meta.warnings as string[]) : [],
    occurredAt: m.occurredAt.toISOString(),
  };
}

const CHANNEL_FOR_TYPE: Record<string, "EMAIL" | "LINKEDIN" | "SMS" | "WHATSAPP"> = {
  LINKEDIN_MESSAGE: "LINKEDIN",
  SMS: "SMS",
  WHATSAPP: "WHATSAPP",
};

async function conversationFor(
  companyId: string,
  leadId: string,
  channel: SalesChannel,
  subject: string | null,
) {
  const existing = await db.salesConversation.findFirst({
    where: { companyId, leadId, channel, status: "OPEN" },
    orderBy: { lastMessageAt: "desc" },
  });
  return existing ?? db.salesConversation.create({ data: { companyId, leadId, channel, subject } });
}

async function history(companyId: string, leadId: string, limit = 12): Promise<ConversationTurn[]> {
  const messages = await db.salesMessage.findMany({
    where: { companyId, conversation: { leadId }, status: { in: ["LOGGED", "SENT"] } },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
  return messages.reverse().map((m) => ({
    direction: m.direction,
    content: m.content.slice(0, 2_000),
    at: m.occurredAt.toISOString().slice(0, 16).replace("T", " "),
  }));
}

function assertContactable(lead: LeadView): void {
  if (lead.status === "DO_NOT_CONTACT")
    throw new AppError("CONFLICT", {
      message: "This lead opted out. No outreach can be prepared for them.",
    });
}

// ───────────────────────────── outreach drafts ─────────────────────────────

/** Ask the AI for an outreach draft. It's stored as a DRAFT — never sent. */
export async function generateOutreachDraft(
  ctx: ActorContext,
  leadId: string,
  rawInput: unknown,
): Promise<MessageView> {
  await requireSales(ctx, "sales.ai");
  const input = generateOutreachSchema.parse(rawInput);
  const lead = await getLead(ctx, leadId);
  assertContactable(lead);
  if (await isSuppressed(ctx.companyId, lead))
    throw new AppError("CONFLICT", { message: "This contact is on your do-not-contact list." });
  await rateLimit("aiGeneration", `sales-draft:${ctx.userId}`);
  await assertSalesAiQuota(ctx.companyId);
  const [config, research, recs, turns] = await Promise.all([
    loadSalesConfig(ctx.companyId),
    getLatestResearch(ctx, leadId),
    getLeadRecommendations(ctx.companyId, lead),
    history(ctx.companyId, leadId),
  ]);
  const channel = CHANNEL_FOR_TYPE[input.type] ?? "EMAIL";
  let draft: OutreachDraft;
  let meta: { model: string; promptVersion: string };
  try {
    const result = await getSalesAI().generateOutreach(
      {
        business: toBusinessContext(config, ctx.userName),
        lead: toLeadContext(lead, recs),
        research: research?.status === "COMPLETED" ? research.result : null,
        type: input.type,
        channel,
        language: input.language ?? config.behavior.language,
        conversation: turns,
        senderName: ctx.userName,
        instructions: input.instructions,
      },
      { companyId: ctx.companyId, userId: ctx.userId },
    );
    draft = result.data;
    meta = { model: result.model, promptVersion: result.promptVersion };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn("sales.draft_failed", { kind: error instanceof LLMError ? error.kind : "unknown" });
    throw new AppError("AI_UNAVAILABLE", {
      message: "The draft couldn't be generated right now. Please try again.",
    });
  }

  // Guardrails: anything off-policy is flagged for the reviewer (the draft is never sent automatically).
  const warnings = [...draft.reviewNotes];
  const lower = draft.body.toLowerCase();
  if (/\bas an ai\b|\bi am an ai\b|language model/i.test(draft.body))
    warnings.push("Mentions being an AI in a way that reads unnaturally — edit before sending.");
  for (const claim of config.playbook.forbiddenClaims) {
    if (claim.length > 3 && lower.includes(claim.toLowerCase()))
      warnings.push(`Contains a forbidden claim from your playbook: “${claim}”.`);
  }
  if (/\b(\d{1,3})\s?%\s*(off|discount)/i.test(draft.body) && !config.playbook.discountPolicy)
    warnings.push("Mentions a discount, but your playbook has no discount policy.");

  const conversation = await conversationFor(ctx.companyId, leadId, channel, draft.subject);
  const message = await db.salesMessage.create({
    data: {
      companyId: ctx.companyId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      channel,
      status: "DRAFT",
      messageType: input.type,
      subject: draft.subject,
      content: draft.body,
      analysis: asJson({ draft, warnings, ...meta }),
      createdById: ctx.userId,
      generatedByAi: true,
      recipient: channel === "EMAIL" ? lead.email : lead.phone,
    },
  });
  await recordSalesActivity({
    companyId: ctx.companyId,
    leadId,
    actorType: "AI",
    type: SALES_ACTIVITY.aiDraftGenerated,
    summary: `AI drafted a ${input.type.toLowerCase().replace(/_/g, " ")} for review`,
    metadata: { messageId: message.id, requestedBy: ctx.userId },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.salesAiRequested,
    entityType: "sales_lead",
    entityId: leadId,
    metadata: { operation: "SALES_GENERATE_MESSAGE", type: input.type },
  });
  return toMessageView(message);
}

async function findMessage(ctx: ActorContext, messageId: string) {
  const message = await db.salesMessage.findFirst({
    where: { id: messageId, companyId: ctx.companyId },
    include: { conversation: true },
  });
  if (!message) throw new AppError("NOT_FOUND", { message: "Message not found." });
  return message;
}

/** Edit, approve or discard a draft. Approval records intent only; sending needs a connected mailbox. */
export async function updateDraft(
  ctx: ActorContext,
  messageId: string,
  rawInput: unknown,
): Promise<MessageView> {
  await requireSales(ctx, "sales.write");
  const input = updateDraftSchema.parse(rawInput);
  const message = await findMessage(ctx, messageId);
  if (message.direction !== "OUTBOUND" || !["DRAFT", "APPROVED"].includes(message.status)) {
    throw new AppError("CONFLICT", { message: "Only unsent drafts can be edited." });
  }
  const updated = await db.salesMessage.update({
    where: { id: messageId },
    data: {
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
  if (input.status) {
    await recordSalesActivity({
      companyId: ctx.companyId,
      leadId: message.conversation.leadId,
      actorType: "USER",
      actorUserId: ctx.userId,
      type: SALES_ACTIVITY.draftUpdated,
      summary: `${ctx.userName} ${input.status === "APPROVED" ? "approved" : input.status === "DISCARDED" ? "discarded" : "edited"} a draft`,
      metadata: { messageId, status: input.status, edited: input.content !== undefined },
    });
  }
  return toMessageView(updated);
}

/**
 * The user sent this draft themselves (outside Cadre). Records it truthfully as
 * logged by a person — Cadre never claims it sent anything.
 */
export async function markDraftSent(ctx: ActorContext, messageId: string): Promise<MessageView> {
  await requireSales(ctx, "sales.write");
  const message = await findMessage(ctx, messageId);
  if (message.direction !== "OUTBOUND" || !["DRAFT", "APPROVED"].includes(message.status)) {
    throw new AppError("CONFLICT", { message: "This message has already been recorded." });
  }
  const lead = await getLead(ctx, message.conversation.leadId);
  assertContactable(lead);
  if (await isSuppressed(ctx.companyId, lead))
    throw new AppError("CONFLICT", { message: "This contact is on your do-not-contact list." });
  const now = new Date();
  const updated = await db.salesMessage.update({
    where: { id: messageId },
    data: { status: "LOGGED", occurredAt: now },
  });
  await afterOutbound(ctx, lead, message.channel, now);
  await recordSalesActivity({
    companyId: ctx.companyId,
    leadId: lead.id,
    actorType: "USER",
    actorUserId: ctx.userId,
    type: SALES_ACTIVITY.messageMarkedSent,
    summary: `${ctx.userName} sent ${CHANNEL_NOUN[message.channel]} (outside ${brand.productName})`,
    metadata: { messageId },
  });
  return toMessageView(updated);
}

async function afterOutbound(ctx: ActorContext, lead: LeadView, channel: SalesChannel, at: Date) {
  await db.salesConversation.updateMany({
    where: { companyId: ctx.companyId, leadId: lead.id, channel },
    data: { lastMessageAt: at },
  });
  await db.salesLead.update({ where: { id: lead.id }, data: { lastContactedAt: at } });
  if (["NEW", "QUALIFIED"].includes(lead.status)) {
    await changeLeadStatus(
      ctx,
      lead.id,
      { status: "CONTACTED", reason: "First message sent" },
      "USER",
    );
  }
}

// ───────────────────────────── logged messages & analysis ─────────────────────────────

/**
 * Record a message exchanged outside Cadre. Inbound replies are analysed by
 * the AI and its findings applied by deterministic rules.
 */
export async function logMessage(
  ctx: ActorContext,
  leadId: string,
  rawInput: unknown,
): Promise<{ message: MessageView; applied: string[] }> {
  await requireSales(ctx, "sales.write");
  const input = logMessageSchema.parse(rawInput);
  const lead = await getLead(ctx, leadId);
  const at = input.occurredAt ?? new Date();
  const conversation = await conversationFor(
    ctx.companyId,
    leadId,
    input.channel,
    input.subject ?? null,
  );
  let message = await db.salesMessage.create({
    data: {
      companyId: ctx.companyId,
      conversationId: conversation.id,
      direction: input.direction,
      channel: input.channel,
      status: "LOGGED",
      subject: input.subject ?? null,
      content: input.content,
      createdById: ctx.userId,
      occurredAt: at,
      sender: input.direction === "INBOUND" ? (lead.email ?? lead.fullName) : ctx.userName,
    },
  });
  await db.salesConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: at },
  });
  await recordSalesActivity({
    companyId: ctx.companyId,
    leadId,
    actorType: "USER",
    actorUserId: ctx.userId,
    type: SALES_ACTIVITY.messageLogged,
    summary:
      input.direction === "INBOUND"
        ? `${lead.fullName} replied (${CHANNEL_NOUN[input.channel].replace(/^an? /, "")})`
        : `${ctx.userName} logged ${CHANNEL_NOUN[input.channel]} to ${lead.fullName}`,
    metadata: { messageId: message.id },
  });

  const applied: string[] = [];
  if (input.direction === "OUTBOUND") {
    if (lead.status !== "DO_NOT_CONTACT") await afterOutbound(ctx, lead, input.channel, at);
    return { message: toMessageView(message), applied };
  }
  if (!can(ctx, "sales.ai")) return { message: toMessageView(message), applied };

  // Inbound: analyse (best effort — the message is kept even if analysis fails).
  try {
    await assertSalesAiQuota(ctx.companyId);
    const config = await loadSalesConfig(ctx.companyId);
    const turns = await history(ctx.companyId, leadId);
    const result = await getSalesAI().analyzeConversation(
      {
        business: toBusinessContext(config, ctx.userName),
        lead: toLeadContext(lead),
        message: { subject: input.subject ?? null, content: input.content },
        history: turns.slice(0, -1),
      },
      { companyId: ctx.companyId, userId: ctx.userId },
    );
    message = await db.salesMessage.update({
      where: { id: message.id },
      data: {
        analysis: asJson({
          analysis: result.data,
          model: result.model,
          promptVersion: result.promptVersion,
        }),
      },
    });
    applied.push(...(await applyReplyAnalysis(ctx, lead, result.data)));
  } catch (error) {
    if (error instanceof AppError && error.code === "PLAN_LIMIT_REACHED")
      applied.push("Not analysed: your plan's AI limit was reached.");
    else {
      logger.warn("sales.analysis_failed", {
        kind: error instanceof LLMError ? error.kind : "unknown",
      });
      applied.push("Not analysed: Sales AI was unavailable. The message was saved.");
    }
  }
  return { message: toMessageView(message), applied };
}

/** Deterministic consequences of an analysed reply. Returns human-readable notes of what changed. */
async function applyReplyAnalysis(
  ctx: ActorContext,
  lead: LeadView,
  analysis: ConversationAnalysis,
): Promise<string[]> {
  const applied: string[] = [];
  const companyId = ctx.companyId;
  await recordSalesActivity({
    companyId,
    leadId: lead.id,
    actorType: "AI",
    type: SALES_ACTIVITY.aiReplyAnalyzed,
    summary: `AI analysed the reply: ${analysis.intent.toLowerCase().replace(/_/g, " ")}${analysis.intentScore >= 70 ? " — high buying intent" : ""}`,
    metadata: {
      intent: analysis.intent,
      intentScore: analysis.intentScore,
      escalate: analysis.escalate,
    },
  });

  if (analysis.intent === "UNSUBSCRIBE") {
    // Opt-outs are honoured immediately and permanently (spec §33, §105).
    await aiChangeLeadStatus(
      companyId,
      lead.id,
      "DO_NOT_CONTACT",
      "the prospect asked not to be contacted",
    );
    const added = await suppressLead(
      companyId,
      { id: lead.id, email: lead.email, phone: lead.phone },
      "UNSUBSCRIBED",
      "Asked to be removed",
    );
    await db.salesMessage.updateMany({
      where: {
        companyId,
        status: { in: ["DRAFT", "APPROVED"] },
        conversation: { leadId: lead.id },
      },
      data: { status: "DISCARDED" },
    });
    await recordSalesActivity({
      companyId,
      leadId: lead.id,
      actorType: "AI",
      type: SALES_ACTIVITY.leadSuppressed,
      summary: "Added to the do-not-contact list; pending drafts discarded",
    });
    applied.push(
      "Marked as do not contact",
      `Added ${added} contact detail${added === 1 ? "" : "s"} to the suppression list`,
      "Discarded pending drafts",
    );
    return applied;
  }

  const config = await loadSalesConfig(companyId);
  const fresh = await db.salesLead.findUniqueOrThrow({ where: { id: lead.id } });
  await db.salesLead.update({
    where: { id: lead.id },
    data: {
      intentScore: analysis.intentScore,
      ...scoreColumns({ ...fresh, intentScore: analysis.intentScore }, config),
    },
  });
  applied.push(`Buying intent updated to ${analysis.intentScore}/100`);

  // Forward-only status moves the AI is allowed to make.
  const positive = [
    "INTERESTED",
    "PRICE_REQUEST",
    "QUESTION",
    "MEETING_REQUEST",
    "OBJECTION",
    "LATER",
  ].includes(analysis.intent);
  let target: "ENGAGED" | "INTERESTED" | "MEETING_REQUESTED" | null = null;
  if (analysis.intent === "MEETING_REQUEST") target = "MEETING_REQUESTED";
  else if (analysis.intent === "INTERESTED" || analysis.intent === "PRICE_REQUEST")
    target = "INTERESTED";
  else if (positive) target = "ENGAGED";
  if (target) {
    if (fresh.status === "QUALIFIED" || fresh.status === "NEW") {
      // A reply implies they were contacted.
      await aiChangeLeadStatus(companyId, lead.id, "CONTACTED", "a reply was received").catch(
        () => false,
      );
    }
    if (
      await aiChangeLeadStatus(
        companyId,
        lead.id,
        target,
        `reply classified as ${analysis.intent.toLowerCase().replace(/_/g, " ")}`,
      )
    ) {
      applied.push(`Moved to ${target.toLowerCase().replace(/_/g, " ")}`);
    } else if (
      target !== "ENGAGED" &&
      (await aiChangeLeadStatus(companyId, lead.id, "ENGAGED", "the prospect replied"))
    ) {
      applied.push("Moved to engaged");
    }
  }

  if (analysis.intentScore >= 70 || analysis.escalate) {
    await notifyCompanyMembers({
      companyId,
      type: "SALES_ALERT",
      title: analysis.escalate
        ? `${lead.fullName} needs a person to reply`
        : `High-intent reply from ${lead.fullName}`,
      body: analysis.summary.slice(0, 200),
      link: `/sales/leads/${lead.id}`,
      dedupeKey: `sales-reply:${lead.id}:${Date.now()}`,
      roles: ["COMPANY_ADMIN", "SALES_MANAGER", "SALES_REP"],
    });
    applied.push(
      analysis.escalate ? "Flagged for a person and notified your team" : "Notified your team",
    );
  }
  return applied;
}

export async function listConversations(
  ctx: ActorContext,
  leadId: string,
): Promise<ConversationView[]> {
  requireSalesRead(ctx);
  const lead = await db.salesLead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw new AppError("NOT_FOUND", { message: "Lead not found." });
  const conversations = await db.salesConversation.findMany({
    where: { companyId: ctx.companyId, leadId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: { where: { status: { not: "DISCARDED" } }, orderBy: { occurredAt: "asc" } },
    },
  });
  return conversations
    .filter((c) => c.messages.length > 0)
    .map((c) => ({
      id: c.id,
      channel: c.channel,
      subject: c.subject,
      lastMessageAt: c.lastMessageAt.toISOString(),
      messages: c.messages.map(toMessageView),
    }));
}
