import { asJson, db, type Prisma, type SalesLead, type TransactionClient } from "@repo/database";
import { AppError, type LeadStatus, type Paginated } from "@repo/shared";
import {
  assertLeadTransition,
  buildFullName,
  canTransitionLead,
  DUPLICATE_REASONS,
  duplicateKeys,
  InvalidLeadTransitionError,
  leadDomain,
  LEAD_STATUS_META,
  normalizeEmail,
  normalizePhone,
  scoreLead,
  type LeadActor,
  type LeadScoreResult,
} from "@repo/sales-engine";
import {
  changeLeadStatusSchema,
  createLeadSchema,
  leadListQuerySchema,
  updateLeadSchema,
  type CreateLeadData,
  type SalesAgentConfig,
} from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../../audit";
import type { ActorContext } from "../../context";
import { assertLeadQuota, requireSales, requireSalesRead } from "./access";
import { recordSalesActivity, SALES_ACTIVITY } from "./activity";
import { loadSalesConfig } from "./agent";

/**
 * Lead management (spec §9–15). Every query is scoped to the actor's company;
 * a lead id from another workspace behaves exactly like a missing one.
 */

export interface LeadView {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  companyName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedinUrl: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  companySize: string | null;
  source: SalesLead["source"];
  status: LeadStatus;
  qualificationScore: number | null;
  intentScore: number | null;
  problemRelevance: number | null;
  leadScore: number | null;
  score: LeadScoreResult | null;
  owner: { id: string; name: string } | null;
  notes: string | null;
  tags: string[];
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

type LeadWithOwner = SalesLead & { owner: { id: string; name: string } | null };

function parseScore(value: unknown): LeadScoreResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<LeadScoreResult>;
  return typeof v.leadScore === "number" && Array.isArray(v.factors) && v.qualification
    ? (v as LeadScoreResult)
    : null;
}

export function toLeadView(lead: LeadWithOwner): LeadView {
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName: lead.fullName,
    companyName: lead.companyName,
    jobTitle: lead.jobTitle,
    email: lead.email,
    phone: lead.phone,
    website: lead.website,
    linkedinUrl: lead.linkedinUrl,
    location: lead.location,
    city: lead.city,
    country: lead.country,
    industry: lead.industry,
    companySize: lead.companySize,
    source: lead.source,
    status: lead.status,
    qualificationScore: lead.qualificationScore,
    intentScore: lead.intentScore,
    problemRelevance: lead.problemRelevance,
    leadScore: lead.leadScore,
    score: parseScore(lead.scoreBreakdown),
    owner: lead.owner,
    notes: lead.notes,
    tags: lead.tags,
    lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    statusChangedAt: lead.statusChangedAt.toISOString(),
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

const OWNER_SELECT = { owner: { select: { id: true, name: true } } } as const;

/** Derived columns kept in sync with the editable fields. */
function derived(
  data: Pick<
    CreateLeadData,
    "firstName" | "lastName" | "companyName" | "email" | "phone" | "website"
  >,
) {
  return {
    fullName: buildFullName(data),
    emailNormalized: normalizeEmail(data.email),
    phoneNormalized: normalizePhone(data.phone),
    domain: leadDomain(data),
  };
}

/** Score columns for a lead; research's problemRelevance feeds the score when present. */
export function scoreColumns(
  lead: Parameters<typeof scoreLead>[0] & { problemRelevance?: number | null },
  config: SalesAgentConfig,
) {
  const result = scoreLead(lead, config, { problemRelevance: lead.problemRelevance ?? null });
  return {
    leadScore: result.leadScore,
    qualificationScore: result.qualificationScore,
    scoreBreakdown: asJson(result),
    scoredAt: new Date(),
  };
}

async function findLeadOrThrow(
  ctx: ActorContext,
  leadId: string,
  client: TransactionClient = db,
): Promise<LeadWithOwner> {
  const lead = await client.salesLead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
    include: OWNER_SELECT,
  });
  if (!lead) throw new AppError("NOT_FOUND", { message: "Lead not found." });
  return lead;
}

/** Owners must be members of the same workspace. */
async function assertOwner(ctx: ActorContext, ownerId: string | null | undefined): Promise<void> {
  if (!ownerId) return;
  const member = await db.companyMember.findFirst({
    where: { companyId: ctx.companyId, userId: ownerId, deletedAt: null },
  });
  if (!member)
    throw new AppError("VALIDATION_FAILED", {
      message: "The lead owner must be a member of this workspace.",
    });
}

/** Existing lead that duplicates `candidate`, using indexed lookups (spec §15). */
export async function findExistingDuplicate(
  companyId: string,
  candidate: Pick<
    CreateLeadData,
    "firstName" | "lastName" | "companyName" | "email" | "phone" | "website"
  >,
  excludeId?: string,
): Promise<{ lead: Pick<SalesLead, "id" | "fullName">; reason: string } | null> {
  const keys = duplicateKeys(candidate);
  if (keys.length === 0) return null;
  const { emailNormalized, phoneNormalized, domain } = derived(candidate);
  const or: Prisma.SalesLeadWhereInput[] = [];
  if (emailNormalized) or.push({ emailNormalized });
  if (phoneNormalized) or.push({ phoneNormalized });
  if (domain) or.push({ domain });
  if (candidate.companyName)
    or.push({ companyName: { equals: candidate.companyName.trim(), mode: "insensitive" } });
  if (candidate.firstName || candidate.lastName) {
    or.push({ fullName: { equals: buildFullName(candidate), mode: "insensitive" } });
  }
  const pool = await db.salesLead.findMany({
    where: { companyId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}), OR: or },
    select: {
      id: true,
      fullName: true,
      firstName: true,
      lastName: true,
      companyName: true,
      email: true,
      phone: true,
      website: true,
    },
    take: 200,
  });
  for (const key of keys) {
    for (const lead of pool) {
      if (duplicateKeys(lead).some((k) => k.kind === key.kind && k.value === key.value)) {
        return {
          lead: { id: lead.id, fullName: lead.fullName },
          reason: DUPLICATE_REASONS[key.kind],
        };
      }
    }
  }
  return null;
}

// ───────────────────────────── queries ─────────────────────────────

export async function listLeads(
  ctx: ActorContext,
  rawQuery: unknown,
): Promise<Paginated<LeadView>> {
  requireSalesRead(ctx);
  const query = leadListQuerySchema.parse(rawQuery ?? {});
  const config = await loadSalesConfig(ctx.companyId);
  const bands = config.scoring.bands;
  const bandRange: Record<string, Prisma.IntNullableFilter | null> = {
    hot: { gte: bands.hot },
    high: { gte: bands.high, lt: bands.hot },
    medium: { gte: bands.medium, lt: bands.high },
    low: { gte: bands.low, lt: bands.medium },
    very_low: { lt: bands.low },
  };
  const where: Prisma.SalesLeadWhereInput = {
    companyId: ctx.companyId,
    deletedAt: null,
    ...(query.status?.length ? { status: { in: query.status } } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.tag ? { tags: { has: query.tag } } : {}),
    ...(query.band === "unscored"
      ? { leadScore: null }
      : query.band
        ? { leadScore: bandRange[query.band] ?? undefined }
        : {}),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: "insensitive" } },
            { companyName: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
            { jobTitle: { contains: query.q, mode: "insensitive" } },
            { industry: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.SalesLeadOrderByWithRelationInput[] =
    query.sort === "newest"
      ? [{ createdAt: "desc" }]
      : query.sort === "updated"
        ? [{ updatedAt: "desc" }]
        : query.sort === "name"
          ? [{ fullName: "asc" }]
          : [{ leadScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  const [total, rows] = await Promise.all([
    db.salesLead.count({ where }),
    db.salesLead.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: OWNER_SELECT,
    }),
  ]);
  return { items: rows.map(toLeadView), total, page: query.page, pageSize: query.pageSize };
}

export async function getLead(ctx: ActorContext, leadId: string): Promise<LeadView> {
  requireSalesRead(ctx);
  return toLeadView(await findLeadOrThrow(ctx, leadId));
}

// ───────────────────────────── mutations ─────────────────────────────

export class DuplicateLeadError extends AppError {
  constructor(existing: { id: string; fullName: string }, reason: string) {
    super("CONFLICT", {
      message: `This lead already exists: ${existing.fullName} (${reason.toLowerCase()}).`,
      expose: { duplicateOf: { id: existing.id, name: existing.fullName }, reason },
    });
  }
}

export async function createLead(ctx: ActorContext, rawInput: unknown): Promise<LeadView> {
  await requireSales(ctx, "sales.write");
  const input = createLeadSchema.parse(rawInput);
  await assertOwner(ctx, input.ownerId);
  await assertLeadQuota(ctx.companyId, 1);
  const duplicate = await findExistingDuplicate(ctx.companyId, input);
  if (duplicate) throw new DuplicateLeadError(duplicate.lead, duplicate.reason);
  const config = await loadSalesConfig(ctx.companyId);
  const lead = await db.$transaction(async (tx) => {
    const created = await tx.salesLead.create({
      data: {
        companyId: ctx.companyId,
        ...leadData(input),
        ...derived(input),
        source: input.source,
        ownerId: input.ownerId ?? ctx.userId,
        createdById: ctx.userId,
        ...scoreColumns({ ...input, status: "NEW" }, config),
      },
      include: OWNER_SELECT,
    });
    await recordSalesActivity(
      {
        companyId: ctx.companyId,
        leadId: created.id,
        actorType: "USER",
        actorUserId: ctx.userId,
        type: SALES_ACTIVITY.leadCreated,
        summary: `${ctx.userName} added ${created.fullName}`,
      },
      tx,
    );
    await recordSalesActivity(
      {
        companyId: ctx.companyId,
        leadId: created.id,
        actorType: "SYSTEM",
        type: SALES_ACTIVITY.leadScored,
        summary: `Lead scored ${created.leadScore ?? 0}/100`,
        metadata: {
          leadScore: created.leadScore,
          qualification: parseScore(created.scoreBreakdown)?.qualification.status ?? null,
        },
      },
      tx,
    );
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.salesLeadCreated,
        entityType: "sales_lead",
        entityId: created.id,
        metadata: { source: input.source },
      },
      tx,
    );
    return created;
  });
  return toLeadView(lead);
}

function leadData(input: Partial<CreateLeadData>) {
  const pick = <K extends keyof CreateLeadData>(key: K) =>
    key in input ? { [key]: input[key] } : {};
  return {
    ...pick("firstName"),
    ...pick("lastName"),
    ...pick("companyName"),
    ...pick("jobTitle"),
    ...pick("email"),
    ...pick("phone"),
    ...pick("website"),
    ...pick("linkedinUrl"),
    ...pick("location"),
    ...pick("city"),
    ...pick("country"),
    ...pick("industry"),
    ...pick("companySize"),
    ...pick("notes"),
    ...pick("tags"),
    ...pick("nextFollowUpAt"),
  } as Partial<Prisma.SalesLeadUncheckedCreateInput>;
}

export async function updateLead(
  ctx: ActorContext,
  leadId: string,
  rawInput: unknown,
): Promise<LeadView> {
  await requireSales(ctx, "sales.write");
  const input = updateLeadSchema.parse(rawInput);
  const current = await findLeadOrThrow(ctx, leadId);
  if ("ownerId" in input) await assertOwner(ctx, input.ownerId);
  const merged = {
    firstName: "firstName" in input ? (input.firstName ?? null) : current.firstName,
    lastName: "lastName" in input ? (input.lastName ?? null) : current.lastName,
    companyName: "companyName" in input ? (input.companyName ?? null) : current.companyName,
    email: "email" in input ? (input.email ?? null) : current.email,
    phone: "phone" in input ? (input.phone ?? null) : current.phone,
    website: "website" in input ? (input.website ?? null) : current.website,
  };
  if (!merged.firstName && !merged.lastName && !merged.companyName && !merged.email) {
    throw new AppError("VALIDATION_FAILED", {
      message: "A lead needs at least a name, a company or an email.",
    });
  }
  const duplicate = await findExistingDuplicate(ctx.companyId, merged, leadId);
  if (duplicate) throw new DuplicateLeadError(duplicate.lead, duplicate.reason);
  const config = await loadSalesConfig(ctx.companyId);
  const next = { ...current, ...leadData(input as Partial<CreateLeadData>) } as SalesLead;
  const changed = Object.keys(input).filter(
    (k) => k !== "tags" || JSON.stringify(input.tags) !== JSON.stringify(current.tags),
  );
  const updated = await db.$transaction(async (tx) => {
    const lead = await tx.salesLead.update({
      where: { id: leadId },
      data: {
        ...leadData(input as Partial<CreateLeadData>),
        ...("ownerId" in input ? { ownerId: input.ownerId ?? null } : {}),
        ...derived(merged),
        ...scoreColumns(next, config),
      },
      include: OWNER_SELECT,
    });
    if (changed.length > 0) {
      await recordSalesActivity(
        {
          companyId: ctx.companyId,
          leadId,
          actorType: "USER",
          actorUserId: ctx.userId,
          type: SALES_ACTIVITY.leadUpdated,
          summary: `${ctx.userName} updated ${changed.slice(0, 4).join(", ")}${changed.length > 4 ? "…" : ""}`,
          metadata: { fields: changed },
        },
        tx,
      );
    }
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.salesLeadUpdated,
        entityType: "sales_lead",
        entityId: leadId,
        metadata: { fields: changed },
      },
      tx,
    );
    return lead;
  });
  return toLeadView(updated);
}

/**
 * Change a lead's status through the state machine. `actor` is "USER" for
 * people; AI-driven changes (later phases) pass "AI" and get the stricter table.
 */
export async function changeLeadStatus(
  ctx: ActorContext,
  leadId: string,
  rawInput: unknown,
  actor: LeadActor = "USER",
): Promise<LeadView> {
  await requireSales(ctx, "sales.write");
  const input = changeLeadStatusSchema.parse(rawInput);
  const current = await findLeadOrThrow(ctx, leadId);
  try {
    assertLeadTransition(current.status, input.status, actor);
  } catch (error) {
    if (error instanceof InvalidLeadTransitionError) {
      throw new AppError("CONFLICT", {
        message:
          current.status === "DO_NOT_CONTACT"
            ? "This lead opted out of contact. Its status can't be changed."
            : `A lead can't move from ${LEAD_STATUS_META[current.status].label} to ${LEAD_STATUS_META[input.status].label}.`,
      });
    }
    throw error;
  }
  const config = await loadSalesConfig(ctx.companyId);
  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    // Optimistic guard: only apply if nobody changed the status meanwhile.
    const res = await tx.salesLead.updateMany({
      where: { id: leadId, companyId: ctx.companyId, status: current.status, deletedAt: null },
      data: {
        status: input.status,
        statusChangedAt: now,
        ...(input.status === "DO_NOT_CONTACT" ? { doNotContactAt: now, nextFollowUpAt: null } : {}),
        ...(input.status === "CONTACTED" && !current.lastContactedAt
          ? { lastContactedAt: now }
          : {}),
        ...scoreColumns({ ...current, status: input.status }, config),
      },
    });
    if (res.count === 0)
      throw new AppError("CONFLICT", {
        message: "This lead was just updated by someone else. Refresh and try again.",
      });
    await recordSalesActivity(
      {
        companyId: ctx.companyId,
        leadId,
        actorType: actor === "USER" ? "USER" : actor,
        actorUserId: actor === "USER" ? ctx.userId : null,
        type: SALES_ACTIVITY.leadStatusChanged,
        summary: `${actor === "USER" ? ctx.userName : "AI"} moved lead to ${LEAD_STATUS_META[input.status].label}${input.reason ? ` — ${input.reason}` : ""}`,
        metadata: { from: current.status, to: input.status, reason: input.reason ?? null },
      },
      tx,
    );
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.salesLeadStatusChanged,
        entityType: "sales_lead",
        entityId: leadId,
        metadata: { from: current.status, to: input.status, actor },
      },
      tx,
    );
    return tx.salesLead.findUniqueOrThrow({ where: { id: leadId }, include: OWNER_SELECT });
  });
  return toLeadView(updated);
}

export function allowedStatusChanges(status: LeadStatus, actor: LeadActor = "USER"): LeadStatus[] {
  return (Object.keys(LEAD_STATUS_META) as LeadStatus[]).filter((to) =>
    canTransitionLead(status, to, actor),
  );
}

export async function deleteLead(ctx: ActorContext, leadId: string): Promise<void> {
  // Deletion is a human-only action (never exposed as an AI tool).
  await requireSales(ctx, "sales.delete");
  const lead = await findLeadOrThrow(ctx, leadId);
  await db.$transaction(async (tx) => {
    await tx.salesLead.update({ where: { id: leadId }, data: { deletedAt: new Date() } });
    await recordSalesActivity(
      {
        companyId: ctx.companyId,
        leadId: null,
        actorType: "USER",
        actorUserId: ctx.userId,
        type: SALES_ACTIVITY.leadDeleted,
        summary: `${ctx.userName} deleted ${lead.fullName}`,
      },
      tx,
    );
    await audit(
      ctx,
      { action: AUDIT_ACTIONS.salesLeadDeleted, entityType: "sales_lead", entityId: leadId },
      tx,
    );
  });
}

export async function rescoreLead(ctx: ActorContext, leadId: string): Promise<LeadView> {
  await requireSales(ctx, "sales.write");
  const lead = await findLeadOrThrow(ctx, leadId);
  const config = await loadSalesConfig(ctx.companyId);
  const updated = await db.salesLead.update({
    where: { id: leadId },
    data: scoreColumns(lead, config),
    include: OWNER_SELECT,
  });
  if (updated.leadScore !== lead.leadScore) {
    await recordSalesActivity({
      companyId: ctx.companyId,
      leadId,
      actorType: "SYSTEM",
      type: SALES_ACTIVITY.leadScored,
      summary: `Lead rescored ${lead.leadScore ?? "–"} → ${updated.leadScore}/100`,
      metadata: { from: lead.leadScore, to: updated.leadScore },
    });
  }
  return toLeadView(updated);
}

/** Background job: rescore every lead after the scoring configuration changed. Idempotent. */
export async function rescoreCompanyLeads(companyId: string): Promise<{ rescored: number }> {
  const config = await loadSalesConfig(companyId);
  let rescored = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await db.salesLead.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    await db.$transaction(
      batch.map((lead) =>
        db.salesLead.update({ where: { id: lead.id }, data: scoreColumns(lead, config) }),
      ),
    );
    rescored += batch.length;
    cursor = batch.at(-1)!.id;
  }
  return { rescored };
}

/** Team members who can own leads (for owner pickers). */
export interface LeadOverview {
  total: number;
  byStatus: Record<LeadStatus, number>;
  byBand: {
    hot: number;
    high: number;
    medium: number;
    low: number;
    very_low: number;
    unscored: number;
  };
}

/** Counts per pipeline stage and score band, for the leads page header. */
export async function getLeadOverview(ctx: ActorContext): Promise<LeadOverview> {
  requireSalesRead(ctx);
  const where: Prisma.SalesLeadWhereInput = { companyId: ctx.companyId, deletedAt: null };
  const { bands } = (await loadSalesConfig(ctx.companyId)).scoring;
  const count = (score: Prisma.IntNullableFilter | null) =>
    db.salesLead.count({ where: { ...where, leadScore: score } });
  const [groups, hot, high, medium, low, veryLow, unscored] = await Promise.all([
    db.salesLead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    count({ gte: bands.hot }),
    count({ gte: bands.high, lt: bands.hot }),
    count({ gte: bands.medium, lt: bands.high }),
    count({ gte: bands.low, lt: bands.medium }),
    count({ lt: bands.low }),
    count(null),
  ]);
  const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<
    LeadStatus,
    number
  >;
  return {
    total: groups.reduce((n, g) => n + g._count._all, 0),
    byStatus,
    byBand: { hot, high, medium, low, very_low: veryLow, unscored },
  };
}

export async function listLeadOwners(
  ctx: ActorContext,
): Promise<Array<{ id: string; name: string }>> {
  requireSalesRead(ctx);
  const members = await db.companyMember.findMany({
    where: {
      companyId: ctx.companyId,
      deletedAt: null,
      role: { in: ["COMPANY_ADMIN", "SALES_MANAGER", "SALES_REP"] },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.user.id, name: m.user.name }));
}
