import { demoDiscoverProspects, LLMError, type DiscoveryMode } from "@repo/ai";
import { getServerEnv } from "@repo/config/env";
import { asJson, db } from "@repo/database";
import { jobQueue } from "@repo/queue";
import { domainFromUrl, normalizeCompanyName, splitFullName } from "@repo/sales-engine";
import { AppError, logger, type ResearchStatus } from "@repo/shared";
import {
  addDiscoveredLeadsSchema,
  discoveryRequestSchema,
  geocodeQuerySchema,
} from "@repo/validation";
import { z } from "zod";
import { requirePermission, type ActorContext } from "../../context";
import { notifyCompanyMembers } from "../../notifications";
import { rateLimit } from "../../rate-limit";
import { getSalesAI } from "../../runtime";
import { assertLeadQuota, assertSalesAiQuota, requireSales, requireSalesRead } from "./access";
import { recordSalesActivity, SALES_ACTIVITY } from "./activity";
import { loadSalesConfig } from "./agent";
import { toBusinessContext } from "./context";
import { createLead, DuplicateLeadError } from "./leads";
import { runProspectingAgent, type FoundProspect } from "./prospecting/agent";
import { geocodePlace, reverseGeocode, type PlaceResult } from "./prospecting/geo";
import { requestLeadResearch } from "./research";

/**
 * Prospect discovery (spec §13). Cadre's own prospecting agent searches open,
 * permitted sources (OpenStreetMap, Wikidata, public business directories) and
 * visits each company's own website — no search-engine scraping, no paid search
 * API. The platform then flags companies already in the CRM and stores the run
 * for a person to review. Leads are created only when someone approves them —
 * or automatically in AUTONOMOUS mode, and then only for verified, new companies.
 */

const criteriaSchema = z.object({
  industries: z.array(z.string()),
  countries: z.array(z.string()),
  cities: z.array(z.string()),
  companySizes: z.array(z.string()),
  keywords: z.string(),
  count: z.number().int(),
  depth: z.enum(["quick", "deep"]).default("deep"),
  area: z
    .object({
      lat: z.number(),
      lon: z.number(),
      radiusKm: z.number(),
      label: z.string().optional(),
    })
    .nullable()
    .default(null),
});
export type DiscoveryCriteriaView = z.infer<typeof criteriaSchema>;

export const WEBSITE_CHECKS = ["verified", "unreachable", "none", "sample"] as const;

const person = z.object({
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  sourceUrl: z.string(),
});

const storedCandidateSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  website: z.string().nullable(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  companySize: z.string().nullable(),
  address: z.string().nullable().default(null),
  description: z.string(),
  matchReasons: z.array(z.string()),
  contact: person.nullable(),
  people: z.array(person).default([]),
  email: z.string().nullable(),
  emailSource: z.string().nullable().default(null),
  phone: z.string().nullable(),
  phoneSource: z.string().nullable().default(null),
  linkedinUrl: z.string().nullable().default(null),
  sources: z.array(z.object({ url: z.string(), title: z.string().nullable() })),
  confidence: z.number(),
  websiteCheck: z.enum(WEBSITE_CHECKS),
  lat: z.number().nullable().default(null),
  lon: z.number().nullable().default(null),
  distanceKm: z.number().nullable().default(null),
  duplicateOf: z.object({ leadId: z.string(), name: z.string() }).nullable(),
  addedLeadId: z.string().nullable(),
});
export type DiscoveryCandidate = z.infer<typeof storedCandidateSchema>;

export interface DiscoveryRunView {
  id: string;
  status: ResearchStatus;
  provider: string;
  criteria: DiscoveryCriteriaView;
  candidates: DiscoveryCandidate[];
  summary: string | null;
  notes: string[];
  /** What the agent is doing right now (while running). */
  progress: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

const notesSchema = z.object({
  summary: z.string().nullable(),
  items: z.array(z.string()),
  progress: z.string().nullable().default(null),
});

function parseCandidates(raw: unknown): DiscoveryCandidate[] {
  const parsed = z.array(storedCandidateSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function toView(run: {
  id: string;
  status: ResearchStatus;
  provider: string;
  criteria: unknown;
  candidates: unknown;
  notes: unknown;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): DiscoveryRunView {
  const notes = notesSchema.safeParse(run.notes);
  const criteria = criteriaSchema.safeParse(run.criteria);
  return {
    id: run.id,
    status: run.status,
    provider: run.provider,
    criteria: criteria.success
      ? criteria.data
      : {
          industries: [],
          countries: [],
          cities: [],
          companySizes: [],
          keywords: "",
          count: 0,
          depth: "deep",
          area: null,
        },
    candidates: parseCandidates(run.candidates),
    summary: notes.success ? notes.data.summary : null,
    notes: notes.success ? notes.data.items : [],
    progress: notes.success ? notes.data.progress : null,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

/** "web": the prospecting agent (real data); "demo": fictional samples; "unavailable": off. */
export function getDiscoveryMode(): DiscoveryMode {
  const provider = getServerEnv().DISCOVERY_PROVIDER;
  return provider === "agent" ? "web" : provider === "samples" ? "demo" : "unavailable";
}

/** What powers discovery here — shown on the Find leads page. */
export function getDiscoveryInfo(): {
  mode: DiscoveryMode;
  reasoning: "ai" | "rules";
  model: string;
  webSearch: boolean;
} {
  const ai = getSalesAI();
  return {
    mode: getDiscoveryMode(),
    reasoning: ai.canReason ? "ai" : "rules",
    model: ai.modelName,
    webSearch: getServerEnv().DISCOVERY_CLAUDE_WEB_SEARCH && ai.discoveryMode === "web",
  };
}

/** Company names and domains already in the workspace (for exclusion and duplicate flags). */
async function existingCompanies(companyId: string) {
  const rows = await db.salesLead.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, fullName: true, companyName: true, domain: true },
    orderBy: { createdAt: "desc" },
    take: 5_000,
  });
  const byName = new Map<string, { leadId: string; name: string }>();
  const byDomain = new Map<string, { leadId: string; name: string }>();
  for (const r of rows) {
    const ref = { leadId: r.id, name: r.companyName ?? r.fullName };
    const name = normalizeCompanyName(r.companyName);
    if (name && !byName.has(name)) byName.set(name, ref);
    if (r.domain && !byDomain.has(r.domain)) byDomain.set(r.domain, ref);
  }
  return { rows, byName, byDomain };
}

// ───────────────────────────── request & run ─────────────────────────────

/** Start a discovery run (one at a time per workspace; returns the running one if any). */
export async function requestDiscovery(
  ctx: ActorContext,
  rawInput: unknown,
): Promise<DiscoveryRunView> {
  requirePermission(ctx, "sales.write");
  await requireSales(ctx, "sales.ai");
  const input = discoveryRequestSchema.parse(rawInput ?? {});
  const mode = getDiscoveryMode();
  if (mode === "unavailable") {
    throw new AppError("CONFLICT", {
      message: "Lead discovery is turned off here. Import a CSV or add leads manually.",
    });
  }
  const running = await db.salesDiscoveryRun.findFirst({
    where: { companyId: ctx.companyId, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (running) return toView(running);
  await rateLimit("aiGeneration", `sales-discovery:${ctx.companyId}`);
  await assertSalesAiQuota(ctx.companyId);
  const run = await db.salesDiscoveryRun.create({
    data: {
      companyId: ctx.companyId,
      status: "QUEUED",
      provider: mode === "demo" ? "demo" : "agent",
      criteria: asJson(input),
      notes: asJson({ summary: null, items: [], progress: "Waiting to start…" }),
      requestedById: ctx.userId,
    },
  });
  await jobQueue.enqueue(
    "sales.discover-leads",
    { runId: run.id },
    { uniqueKey: `sales-discovery:${run.id}`, maxAttempts: 1 },
  );
  return toView(run);
}

function fromAgent(p: FoundProspect): Omit<DiscoveryCandidate, "id" | "duplicateOf"> {
  return {
    companyName: p.companyName.trim(),
    website: p.website,
    domain: p.domain,
    industry: p.industry,
    city: p.city,
    country: p.country,
    companySize: p.companySize,
    address: p.address,
    description: p.description,
    matchReasons: p.matchReasons,
    contact: p.people[0] ?? null,
    people: p.people,
    email: p.email,
    emailSource: p.emailSource,
    phone: p.phone,
    phoneSource: p.phoneSource,
    linkedinUrl: p.linkedinUrl,
    sources: p.sources,
    confidence: p.confidence,
    websiteCheck: p.websiteCheck,
    lat: p.lat,
    lon: p.lon,
    distanceKm: p.distanceKm,
    addedLeadId: null,
  };
}

/** Background job body. Expected failures mark the run FAILED with a user-safe reason. */
export async function runDiscovery(runId: string): Promise<DiscoveryRunView> {
  const claimed = await db.salesDiscoveryRun.updateMany({
    where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  const run = await db.salesDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
  if (claimed.count === 0) return toView(run);
  const criteria = criteriaSchema.parse(run.criteria);
  const meta = { companyId: run.companyId, userId: run.requestedById };
  if (criteria.area && (!criteria.area.label || criteria.countries.length === 0)) {
    const place = await reverseGeocode(criteria.area.lat, criteria.area.lon).catch(() => null);
    if (place) {
      criteria.area.label ||= place.label;
      if (criteria.countries.length === 0 && place.country) criteria.countries = [place.country];
      if (criteria.cities.length === 0 && place.city) criteria.cities = [place.city];
    }
  }

  // Live progress for the UI, written at most every ~1.5 s.
  // The latest message always lands (trailing flush), and nothing is written after the run ends.
  let lastWrite = 0;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;
  const flush = async () => {
    timer = null;
    if (finished || pending === null) return;
    const message = pending;
    pending = null;
    lastWrite = Date.now();
    await db.salesDiscoveryRun
      .updateMany({
        where: { id: runId, status: "RUNNING" },
        data: { notes: asJson({ summary: null, items: [], progress: message }) },
      })
      .catch(() => undefined);
  };
  const onProgress = async (message: string) => {
    pending = message;
    const wait = 1_500 - (Date.now() - lastWrite);
    if (wait <= 0) await flush();
    else timer ??= setTimeout(() => void flush(), wait);
  };
  const stopProgress = () => {
    finished = true;
    if (timer) clearTimeout(timer);
  };

  try {
    const [config, company, existing] = await Promise.all([
      loadSalesConfig(run.companyId),
      db.company.findUniqueOrThrow({ where: { id: run.companyId }, select: { name: true } }),
      existingCompanies(run.companyId),
    ]);
    const business = toBusinessContext(config, company.name);
    const ai = getSalesAI();
    const sample = run.provider === "demo";

    let found: Array<Omit<DiscoveryCandidate, "id" | "duplicateOf">>;
    let summary: string;
    let notes: string[];
    if (sample) {
      const demo = demoDiscoverProspects({
        business,
        criteria,
        exclude: {
          names: existing.rows.map((r) => r.companyName).filter((n): n is string => Boolean(n)),
          domains: [...existing.byDomain.keys()],
        },
      });
      found = demo.prospects.map((p) => ({
        companyName: p.companyName,
        website: p.website,
        domain: domainFromUrl(p.website),
        industry: p.industry,
        city: p.city,
        country: p.country,
        companySize: p.companySize,
        address: null,
        description: p.description,
        matchReasons: p.matchReasons,
        contact: null,
        people: [],
        email: null,
        emailSource: null,
        phone: null,
        phoneSource: null,
        linkedinUrl: null,
        sources: [],
        confidence: p.confidence,
        websiteCheck: "sample" as const,
        lat: null,
        lon: null,
        distanceKm: null,
        addedLeadId: null,
      }));
      summary = demo.searchSummary;
      notes = demo.notes;
    } else {
      const useWebSearch = getServerEnv().DISCOVERY_CLAUDE_WEB_SEARCH && ai.discoveryMode === "web";
      const result = await runProspectingAgent({
        ai,
        business,
        criteria,
        depth: criteria.depth,
        exclude: {
          names: new Set(existing.byName.keys()),
          domains: new Set(existing.byDomain.keys()),
        },
        meta,
        onProgress,
        extraCandidates: useWebSearch
          ? async () =>
              (
                await ai.discoverProspects(
                  {
                    business,
                    criteria,
                    exclude: {
                      names: existing.rows
                        .map((r) => r.companyName)
                        .filter((n): n is string => Boolean(n))
                        .slice(0, 150),
                      domains: [...existing.byDomain.keys()].slice(0, 150),
                    },
                  },
                  meta,
                )
              ).data.prospects.map((p) => ({
                name: p.companyName,
                website: p.website,
                sources: p.sourceUrls,
                fact: `Found by web search: ${p.description}`,
              }))
          : undefined,
      });
      found = result.prospects.map(fromAgent);
      summary = result.summary;
      notes = result.notes;
    }

    stopProgress();
    const candidates: DiscoveryCandidate[] = found.map((c, i) => ({
      ...c,
      id: `c${i + 1}`,
      duplicateOf:
        (c.domain ? existing.byDomain.get(c.domain) : undefined) ??
        existing.byName.get(normalizeCompanyName(c.companyName)) ??
        null,
    }));
    const ready = candidates.filter((c) => !c.duplicateOf).length;
    const completed = await db.salesDiscoveryRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        candidates: asJson(candidates),
        notes: asJson({ summary, items: notes, progress: null }),
        model: sample ? "samples" : ai.modelName,
        completedAt: new Date(),
      },
    });
    await recordSalesActivity({
      companyId: run.companyId,
      actorType: "AI",
      type: SALES_ACTIVITY.aiDiscovered,
      summary:
        candidates.length === 0
          ? "AI lead discovery found no new matching companies"
          : `AI found ${candidates.length} ${candidates.length === 1 ? "company" : "companies"}${sample ? " (demo samples)" : ""} — ${ready} new to review`,
      metadata: { runId, found: candidates.length, ready },
    });

    let autoAdded = 0;
    if (config.behavior.autonomy === "AUTONOMOUS" && run.requestedById) {
      const auto = candidates.filter(
        (c) => !c.duplicateOf && (c.websiteCheck === "verified" || c.websiteCheck === "sample"),
      );
      const actor = await actorFor(run.companyId, run.requestedById);
      if (actor && auto.length > 0) {
        const added = await addCandidates(
          actor,
          completed.id,
          auto.map((c) => c.id),
          { research: false, byAi: true },
        );
        autoAdded = added.added;
      }
    }
    if (run.requestedById) {
      await notifyCompanyMembers({
        companyId: run.companyId,
        type: "SALES_ALERT",
        title:
          autoAdded > 0
            ? `AI added ${autoAdded} new ${autoAdded === 1 ? "lead" : "leads"}`
            : candidates.length > 0
              ? `AI found ${ready} ${ready === 1 ? "company" : "companies"} to review`
              : "Lead discovery finished",
        body: summary.slice(0, 200),
        link: `/sales/discover?run=${runId}`,
        dedupeKey: `sales-discovery:${runId}`,
        userIds: [run.requestedById],
      });
    }
    return getRunById(run.companyId, runId);
  } catch (error) {
    stopProgress();
    logger.warn("sales.discovery_failed", {
      runId,
      kind: error instanceof LLMError ? error.kind : "unknown",
      error,
    });
    const message =
      error instanceof LLMError
        ? error.kind === "AUTH"
          ? "the AI provider rejected the API key. Check AI_API_KEY."
          : "the AI service is temporarily unavailable. Try again shortly."
        : "something went wrong. Try again.";
    await recordSalesActivity({
      companyId: run.companyId,
      actorType: "AI",
      type: SALES_ACTIVITY.aiDiscoveryFailed,
      summary: `Lead discovery unavailable — ${message}`,
      metadata: { runId },
    });
    return toView(
      await db.salesDiscoveryRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          error: message,
          notes: asJson({ summary: null, items: [], progress: null }),
          completedAt: new Date(),
        },
      }),
    );
  }
}

async function actorFor(companyId: string, userId: string): Promise<ActorContext | null> {
  const member = await db.companyMember.findFirst({
    where: { companyId, userId, deletedAt: null },
    select: { role: true, user: { select: { name: true, platformRole: true } } },
  });
  return member
    ? {
        userId,
        userName: member.user.name,
        companyId,
        role: member.role,
        platformRole: member.user.platformRole,
      }
    : null;
}

async function getRunById(companyId: string, runId: string): Promise<DiscoveryRunView> {
  const run = await db.salesDiscoveryRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new AppError("NOT_FOUND", { message: "Discovery run not found." });
  return toView(run);
}

// ───────────────────────────── map ─────────────────────────────

/** Places for the Find leads map search box. */
export async function searchPlaces(ctx: ActorContext, rawInput: unknown): Promise<PlaceResult[]> {
  requireSalesRead(ctx);
  const { q } = geocodeQuerySchema.parse(rawInput);
  await rateLimit("placeSearch", ctx.userId);
  try {
    return await geocodePlace(q);
  } catch {
    throw new AppError("SERVICE_UNAVAILABLE", {
      message: "Place search is busy right now. Try again, or click the map to choose a spot.",
    });
  }
}

/** The place name at a point the user clicked (best effort). */
export async function describePlace(
  ctx: ActorContext,
  rawInput: unknown,
): Promise<PlaceResult | null> {
  requireSalesRead(ctx);
  const { lat, lon } = z
    .object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) })
    .parse(rawInput);
  await rateLimit("placeSearch", ctx.userId);
  return reverseGeocode(lat, lon).catch(() => null);
}

// ───────────────────────────── reads ─────────────────────────────

export async function getDiscoveryRun(ctx: ActorContext, runId: string): Promise<DiscoveryRunView> {
  requireSalesRead(ctx);
  return getRunById(ctx.companyId, runId);
}

export async function listDiscoveryRuns(
  ctx: ActorContext,
  limit = 10,
): Promise<DiscoveryRunView[]> {
  requireSalesRead(ctx);
  const runs = await db.salesDiscoveryRun.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  });
  return runs.map(toView);
}

// ───────────────────────────── add as leads ─────────────────────────────

function leadNotes(c: DiscoveryCandidate, sample: boolean): string {
  return [
    sample ? "Demo sample — fictional company, don't contact." : null,
    c.description,
    c.matchReasons.length ? `Why it matches: ${c.matchReasons.join(" ")}` : null,
    c.people.length
      ? `People named on their website:\n${c.people.map((p) => `- ${p.fullName}${p.jobTitle ? `, ${p.jobTitle}` : ""} (${p.sourceUrl})`).join("\n")}`
      : null,
    c.address ? `Address: ${c.address}` : null,
    c.email && c.emailSource ? `Email found at: ${c.emailSource}` : null,
    c.phone && c.phoneSource ? `Phone found at: ${c.phoneSource}` : null,
    c.sources.length ? `Sources:\n${c.sources.map((s) => `- ${s.url}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function addCandidates(
  ctx: ActorContext,
  runId: string,
  candidateIds: string[],
  options: { research: boolean; byAi: boolean },
): Promise<{ added: number; skipped: number; researchQueued: number; leadIds: string[] }> {
  const run = await db.salesDiscoveryRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
  });
  if (!run) throw new AppError("NOT_FOUND", { message: "Discovery run not found." });
  if (run.status !== "COMPLETED")
    throw new AppError("CONFLICT", { message: "This discovery run hasn't finished yet." });
  const candidates = parseCandidates(run.candidates);
  const wanted = new Set(candidateIds);
  const selected = candidates.filter((c) => wanted.has(c.id) && !c.addedLeadId);
  if (selected.length === 0) return { added: 0, skipped: 0, researchQueued: 0, leadIds: [] };
  await assertLeadQuota(ctx.companyId, selected.length);
  const sample = run.provider === "demo";
  // Company-level check again: leads may have been added since the run finished,
  // and the person-level duplicate rules wouldn't catch "same company, no contact".
  const existing = await existingCompanies(ctx.companyId);

  const leadIds: string[] = [];
  let skipped = 0;
  for (const c of selected) {
    const known =
      (c.domain ? existing.byDomain.get(c.domain) : undefined) ??
      existing.byName.get(normalizeCompanyName(c.companyName));
    if (known) {
      c.duplicateOf = known;
      skipped += 1;
      continue;
    }
    const name = c.contact ? splitFullName(c.contact.fullName) : null;
    try {
      const lead = await createLead(ctx, {
        firstName: name?.firstName ?? null,
        lastName: name?.lastName ?? null,
        jobTitle: c.contact?.jobTitle ?? null,
        companyName: c.companyName,
        website: c.website,
        linkedinUrl: c.linkedinUrl,
        email: c.email,
        phone: c.phone,
        industry: c.industry,
        city: c.city,
        country: c.country,
        location: c.address,
        companySize: c.companySize,
        notes: leadNotes(c, sample),
        tags: sample ? ["ai-discovered", "demo-sample"] : ["ai-discovered"],
        source: "DISCOVERY",
      });
      c.addedLeadId = lead.id;
      const ref = { leadId: lead.id, name: c.companyName };
      existing.byName.set(normalizeCompanyName(c.companyName), ref);
      if (c.domain) existing.byDomain.set(c.domain, ref);
      leadIds.push(lead.id);
      await recordSalesActivity({
        companyId: ctx.companyId,
        leadId: lead.id,
        actorType: "AI",
        type: SALES_ACTIVITY.leadDiscovered,
        summary: options.byAi
          ? `AI found and added ${c.companyName} (autonomous mode)`
          : `Found by AI lead discovery · approved by ${ctx.userName}`,
        metadata: { runId, sources: c.sources.map((s) => s.url), websiteCheck: c.websiteCheck },
      });
    } catch (error) {
      if (!(error instanceof DuplicateLeadError)) throw error;
      const exposed = (error.expose as { duplicateOf?: { id: string; name: string } } | undefined)
        ?.duplicateOf;
      if (exposed) c.duplicateOf = { leadId: exposed.id, name: exposed.name };
      skipped += 1;
    }
  }
  await db.salesDiscoveryRun.update({
    where: { id: run.id },
    data: { candidates: asJson(candidates) },
  });

  let researchQueued = 0;
  if (options.research) {
    for (const id of leadIds) {
      try {
        await requestLeadResearch(ctx, id);
        researchQueued += 1;
      } catch (error) {
        // Rate or plan limits: stop queueing; the leads are still added.
        logger.info("sales.discovery_research_skipped", { leadId: id, error });
        break;
      }
    }
  }
  return { added: leadIds.length, skipped, researchQueued, leadIds };
}

/** Add reviewed candidates as leads (source DISCOVERY), optionally queueing research. */
export async function addDiscoveredLeads(ctx: ActorContext, runId: string, rawInput: unknown) {
  await requireSales(ctx, "sales.write");
  const input = addDiscoveredLeadsSchema.parse(rawInput);
  return addCandidates(ctx, runId, input.candidateIds, {
    research: input.research,
    byAi: false,
  });
}
