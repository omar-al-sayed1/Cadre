import { DEFAULT_PLAN_KEY, PLANS } from "@repo/config";
import { asJson, db } from "@repo/database";
import { AppError, slugify } from "@repo/shared";
import {
  companySettingsSchema,
  createCompanySchema,
  parseCompanySettings,
  updateCompanySchema,
  updateCompanySettingsSchema,
  type CompanySettings,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type UpdateCompanySettingsInput,
} from "@repo/validation";
import { getStorage, storageKey, validateUpload } from "@repo/storage";
import { LIMITS } from "@repo/config";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { createId } from "../ids";

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "company";
  for (let i = 0; i < 5; i += 1) {
    const slug = i === 0 ? base : `${base}-${createId("").slice(-5)}`;
    const exists = await db.company.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  return `${base}-${createId("")}`;
}

async function ensurePlan(key: string) {
  const def = PLANS[key as keyof typeof PLANS] ?? PLANS.starter;
  return db.plan.upsert({
    where: { key: def.key },
    update: {},
    create: {
      key: def.key,
      name: def.name,
      monthlyInterviewLimit: def.monthlyInterviewLimit,
      monthlyAiBudgetUsd: def.monthlyAiBudgetUsd,
      seats: def.seats,
      priceMonthlyCents: def.priceMonthlyCents,
    },
  });
}

/** Onboarding step 1: create a company and make the creator its admin. */
export async function createCompany(
  user: { id: string; name: string },
  rawInput: CreateCompanyInput,
) {
  const input = createCompanySchema.parse(rawInput);
  const plan = await ensurePlan(DEFAULT_PLAN_KEY);
  const slug = await uniqueSlug(input.name);
  return db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.name,
        slug,
        website: input.website,
        industry: input.industry,
        size: input.size ?? null,
        country: input.country,
        timezone: input.timezone,
        settings: asJson(companySettingsSchema.parse({})),
        planId: plan.id,
      },
    });
    await tx.companyMember.create({
      data: { companyId: company.id, userId: user.id, role: "COMPANY_ADMIN" },
    });
    await tx.user.update({ where: { id: user.id }, data: { activeCompanyId: company.id } });
    await audit(
      {
        userId: user.id,
        userName: user.name,
        companyId: company.id,
        role: "COMPANY_ADMIN",
        platformRole: "USER",
      },
      { action: AUDIT_ACTIONS.companyCreated, entityType: "company", entityId: company.id },
      tx,
    );
    return company;
  });
}

export async function getCompany(ctx: ActorContext) {
  requirePermission(ctx, "company.read");
  const company = await db.company.findFirst({
    where: { id: ctx.companyId, deletedAt: null },
    include: { plan: true },
  });
  if (!company) throw new AppError("NOT_FOUND", { message: "Company not found." });
  return { ...company, settings: parseCompanySettings(company.settings) };
}

export async function updateCompany(ctx: ActorContext, rawInput: UpdateCompanyInput) {
  requirePermission(ctx, "company.update");
  const input = updateCompanySchema.parse(rawInput);
  const company = await db.company.update({
    where: { id: ctx.companyId },
    data: {
      name: input.name,
      website: input.website,
      industry: input.industry,
      size: input.size,
      country: input.country,
      timezone: input.timezone,
      primaryColor: input.primaryColor,
      welcomeText: input.welcomeText,
    },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.companyUpdated,
    entityType: "company",
    entityId: company.id,
    metadata: { fields: Object.keys(rawInput) },
  });
  return company;
}

export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { settings: true },
  });
  return parseCompanySettings(company?.settings);
}

export async function updateCompanySettings(
  ctx: ActorContext,
  rawInput: UpdateCompanySettingsInput,
): Promise<CompanySettings> {
  requirePermission(ctx, "company.settings");
  const patch = updateCompanySettingsSchema.parse(rawInput);
  const current = await getCompanySettings(ctx.companyId);
  const next = companySettingsSchema.parse({ ...current, ...patch });
  await db.company.update({ where: { id: ctx.companyId }, data: { settings: asJson(next) } });
  await audit(ctx, {
    action: AUDIT_ACTIONS.companySettingsUpdated,
    entityType: "company",
    entityId: ctx.companyId,
    metadata: { fields: Object.keys(patch) },
  });
  return next;
}

export async function uploadCompanyLogo(ctx: ActorContext, bytes: Uint8Array) {
  requirePermission(ctx, "company.update");
  const check = validateUpload(bytes, {
    maxBytes: LIMITS.logo.maxBytes,
    allowedTypes: LIMITS.logo.allowedMimeTypes,
  });
  if (!check.ok) throw new AppError(check.code, { message: check.message });
  const key = storageKey(`companies/${ctx.companyId}/logo`, check.extension);
  await getStorage().put({ key, body: bytes, contentType: check.type });
  const previous = await db.company.findUnique({
    where: { id: ctx.companyId },
    select: { logoKey: true },
  });
  await db.company.update({ where: { id: ctx.companyId }, data: { logoKey: key } });
  if (previous?.logoKey)
    await getStorage()
      .delete(previous.logoKey)
      .catch(() => undefined);
  await audit(ctx, {
    action: AUDIT_ACTIONS.companyUpdated,
    entityType: "company",
    entityId: ctx.companyId,
    metadata: { fields: ["logo"] },
  });
  return key;
}

/** Companies a user belongs to (for the workspace switcher). */
export async function listUserCompanies(userId: string) {
  return db.companyMember.findMany({
    where: { userId, deletedAt: null, company: { deletedAt: null } },
    include: { company: { select: { id: true, name: true, slug: true, logoKey: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function switchActiveCompany(userId: string, companyId: string): Promise<void> {
  const membership = await db.companyMember.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });
  if (!membership || membership.deletedAt) throw new AppError("FORBIDDEN");
  await db.user.update({ where: { id: userId }, data: { activeCompanyId: companyId } });
}
