import { asJson, db, type TransactionClient } from "@repo/database";
import { templateSnapshotSchema, type TemplateSnapshot } from "@repo/interview-engine/snapshot";
import { SCORING_VERSION } from "@repo/scoring";
import { AppError } from "@repo/shared";
import {
  codingConfigSchema,
  generateTemplateSchema,
  parseCompanySettings,
  parseScoringConfig,
  parseTemplateAiSettings,
  questionInputSchema,
  regenerateQuestionSchema,
  templateDocumentSchema,
  type GenerateTemplateInput,
  type QuestionData,
  type RegenerateQuestionInput,
  type TemplateDocument,
  type TemplateDocumentInput,
} from "@repo/validation";
import type { GeneratedInterview, JobContext } from "@repo/ai";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { isFeatureEnabled } from "../feature-flags";
import { rateLimit } from "../rate-limit";
import { getInterviewAI } from "../runtime";
import { assertEntitled } from "./subscriptions";

async function loadJobWithSkills(ctx: ActorContext, jobId: string, client: TransactionClient = db) {
  const job = await client.job.findFirst({
    where: { id: jobId, companyId: ctx.companyId, deletedAt: null },
    include: {
      skills: { include: { skill: true }, orderBy: { weight: "desc" } },
      company: { select: { name: true, settings: true } },
    },
  });
  if (!job) throw new AppError("NOT_FOUND", { message: "Job not found." });
  return job;
}

type JobWithSkills = Awaited<ReturnType<typeof loadJobWithSkills>>;

function jobContext(job: JobWithSkills): JobContext {
  return {
    title: job.title,
    companyName: job.company.name,
    experienceLevel: job.experienceLevel,
    description: job.description,
    requirements: [
      job.requirements,
      job.preferredQualifications && `Preferred: ${job.preferredQualifications}`,
    ]
      .filter(Boolean)
      .join("\n"),
    responsibilities: job.responsibilities,
    skills: job.skills.map((s) => ({
      key: s.skillId,
      name: s.skill.name,
      weight: s.weight,
      expectedLevel: s.expectedLevel,
      critical: s.isCritical,
    })),
  };
}

/** Write a template document's sections and questions (replacing existing ones). */
async function writeStructure(
  tx: TransactionClient,
  templateId: string,
  doc: TemplateDocument,
  validSkillIds: Set<string>,
) {
  await tx.interviewQuestion.deleteMany({ where: { templateId } });
  await tx.interviewSection.deleteMany({ where: { templateId } });
  for (const [sectionIndex, section] of doc.sections.entries()) {
    const created = await tx.interviewSection.create({
      data: {
        templateId,
        name: section.name,
        description: section.description,
        order: sectionIndex,
        targetDurationMinutes: section.targetDurationMinutes,
        minQuestions: section.minQuestions,
        maxQuestions: section.maxQuestions,
        weight: section.weight,
        focusSkillIds: section.focusSkillIds.filter((id) => validSkillIds.has(id)),
      },
    });
    if (section.questions.length > 0) {
      await tx.interviewQuestion.createMany({
        data: section.questions.map((q, questionIndex) => ({
          templateId,
          sectionId: created.id,
          text: q.text,
          type: q.type,
          difficulty: q.difficulty,
          skillId: q.skillId && validSkillIds.has(q.skillId) ? q.skillId : null,
          weight: q.weight,
          expectedTopics: q.expectedTopics,
          idealAnswer: q.idealAnswer,
          redFlags: q.redFlags,
          followUpGuidance: q.followUpGuidance,
          mandatory: q.mandatory,
          source: q.source,
          order: questionIndex,
          bankItemId: q.bankItemId ?? null,
          codingConfig: q.codingConfig ? asJson(q.codingConfig) : undefined,
        })),
      });
    }
  }
}

function templateFields(doc: TemplateDocument) {
  return {
    name: doc.name,
    description: doc.description,
    type: doc.type,
    durationMinutes: doc.durationMinutes,
    minQuestions: doc.minQuestions,
    maxQuestions: doc.maxQuestions,
    difficulty: doc.difficulty,
    language: doc.language,
    responseMode: doc.responseMode,
    personality: doc.personality,
    interviewerName: doc.interviewerName,
    voice: doc.voice,
    aiSettings: asJson(doc.aiSettings),
    scoringConfig: asJson(doc.scoringConfig),
  };
}

export async function createTemplate(
  ctx: ActorContext,
  jobId: string,
  rawDocument: TemplateDocumentInput,
  options: { generatedByAi?: boolean } = {},
) {
  requirePermission(ctx, "template.write");
  await assertEntitled(ctx.companyId, "interviewer");
  const doc = templateDocumentSchema.parse(rawDocument);
  return db.$transaction(async (tx) => {
    const job = await loadJobWithSkills(ctx, jobId, tx);
    const template = await tx.interviewTemplate.create({
      data: {
        ...templateFields(doc),
        companyId: ctx.companyId,
        jobId,
        createdById: ctx.userId,
        generatedByAi: options.generatedByAi ?? false,
      },
    });
    await writeStructure(tx, template.id, doc, new Set(job.skills.map((s) => s.skillId)));
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.templateCreated,
        entityType: "interview_template",
        entityId: template.id,
        metadata: { jobId },
      },
      tx,
    );
    return template;
  });
}

export async function saveTemplateDocument(
  ctx: ActorContext,
  templateId: string,
  rawDocument: TemplateDocumentInput,
) {
  requirePermission(ctx, "template.write");
  const doc = templateDocumentSchema.parse(rawDocument);
  return db.$transaction(async (tx) => {
    const existing = await tx.interviewTemplate.findFirst({
      where: { id: templateId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!existing) throw new AppError("NOT_FOUND", { message: "Interview not found." });
    if (existing.status === "ARCHIVED")
      throw new AppError("CONFLICT", { message: "Archived interviews can't be edited." });
    const job = await loadJobWithSkills(ctx, existing.jobId, tx);
    const template = await tx.interviewTemplate.update({
      where: { id: templateId },
      data: { ...templateFields(doc), hasUnpublishedChanges: true },
    });
    await writeStructure(tx, templateId, doc, new Set(job.skills.map((s) => s.skillId)));
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.templateUpdated,
        entityType: "interview_template",
        entityId: templateId,
      },
      tx,
    );
    return template;
  });
}

export async function getTemplate(ctx: ActorContext, templateId: string) {
  requirePermission(ctx, "template.read");
  const template = await db.interviewTemplate.findFirst({
    where: { id: templateId, companyId: ctx.companyId, deletedAt: null },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { questions: { orderBy: { order: "asc" } } },
      },
      job: { include: { skills: { include: { skill: true }, orderBy: { weight: "desc" } } } },
      versions: {
        orderBy: { version: "desc" },
        take: 10,
        select: { id: true, version: true, publishedAt: true },
      },
      _count: { select: { invitations: true } },
    },
  });
  if (!template) throw new AppError("NOT_FOUND", { message: "Interview not found." });
  const document: TemplateDocument = templateDocumentSchema.parse({
    name: template.name,
    description: template.description,
    type: template.type,
    durationMinutes: template.durationMinutes,
    minQuestions: template.minQuestions,
    maxQuestions: template.maxQuestions,
    difficulty: template.difficulty,
    language: template.language,
    responseMode: template.responseMode,
    personality: template.personality,
    interviewerName: template.interviewerName,
    voice: template.voice,
    aiSettings: parseTemplateAiSettings(template.aiSettings),
    scoringConfig: parseScoringConfig(template.scoringConfig),
    sections: template.sections.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      targetDurationMinutes: s.targetDurationMinutes,
      minQuestions: s.minQuestions,
      maxQuestions: s.maxQuestions,
      weight: s.weight,
      focusSkillIds: s.focusSkillIds,
      questions: s.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        skillId: q.skillId,
        weight: q.weight,
        expectedTopics: q.expectedTopics,
        idealAnswer: q.idealAnswer,
        redFlags: q.redFlags,
        followUpGuidance: q.followUpGuidance,
        mandatory: q.mandatory,
        source: q.source,
        bankItemId: q.bankItemId,
        codingConfig: q.codingConfig ? codingConfigSchema.parse(q.codingConfig) : null,
      })),
    })),
  });
  return { template, document };
}

export async function listTemplates(ctx: ActorContext, jobId?: string) {
  requirePermission(ctx, "template.read");
  return db.interviewTemplate.findMany({
    where: { companyId: ctx.companyId, deletedAt: null, ...(jobId ? { jobId } : {}) },
    orderBy: { updatedAt: "desc" },
    include: {
      job: { select: { id: true, title: true } },
      _count: { select: { invitations: true, questions: true } },
    },
  });
}

/** Build the immutable snapshot used by sessions (spec §94). */
export async function buildSnapshot(
  tx: TransactionClient,
  ctx: ActorContext,
  templateId: string,
  version: number,
): Promise<TemplateSnapshot> {
  const template = await tx.interviewTemplate.findFirst({
    where: { id: templateId, companyId: ctx.companyId, deletedAt: null },
    include: {
      sections: { orderBy: { order: "asc" } },
      questions: { orderBy: [{ order: "asc" }] },
    },
  });
  if (!template) throw new AppError("NOT_FOUND", { message: "Interview not found." });
  const job = await loadJobWithSkills(ctx, template.jobId, tx);
  const settings = parseCompanySettings(job.company.settings);
  const skillKeys = new Set(job.skills.map((s) => s.skillId));
  const firstSection = template.sections[0];
  if (!firstSection)
    throw new AppError("VALIDATION_FAILED", {
      message: "Add at least one section before publishing.",
    });
  if (template.questions.length === 0)
    throw new AppError("VALIDATION_FAILED", {
      message: "Add at least one question before publishing.",
    });

  return templateSnapshotSchema.parse({
    schemaVersion: 1,
    templateId: template.id,
    version,
    name: template.name,
    type: template.type,
    durationMinutes: template.durationMinutes,
    minQuestions: template.minQuestions,
    maxQuestions: template.maxQuestions,
    difficulty: template.difficulty,
    language: template.language,
    responseMode: template.responseMode,
    personality: template.personality,
    interviewerName: template.interviewerName ?? settings.interviewerName,
    voice: template.voice ?? settings.interviewerVoice,
    aiSettings: parseTemplateAiSettings(template.aiSettings),
    scoringConfig: parseScoringConfig(template.scoringConfig),
    job: {
      id: job.id,
      title: job.title,
      companyName: job.company.name,
      experienceLevel: job.experienceLevel,
      description: job.description,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
    },
    skills: job.skills.map((s) => ({
      key: s.skillId,
      name: s.skill.name,
      category: s.skill.category,
      weight: s.weight,
      expectedLevel: s.expectedLevel,
      critical: s.isCritical,
    })),
    sections: template.sections.map((s) => ({
      key: s.id,
      name: s.name,
      description: s.description,
      order: s.order,
      targetDurationSeconds: Math.max(30, s.targetDurationMinutes * 60),
      minQuestions: s.minQuestions,
      maxQuestions: s.maxQuestions,
      weight: s.weight,
      focusSkillKeys: s.focusSkillIds.filter((id) => skillKeys.has(id)),
    })),
    questions: template.questions.map((q) => ({
      key: q.id,
      sectionKey: q.sectionId ?? firstSection.id,
      text: q.text,
      type: q.type,
      difficulty: q.difficulty,
      skillKey: q.skillId && skillKeys.has(q.skillId) ? q.skillId : null,
      weight: q.weight,
      expectedTopics: q.expectedTopics,
      idealAnswer: q.idealAnswer,
      redFlags: q.redFlags,
      followUpGuidance: q.followUpGuidance,
      mandatory: q.mandatory,
      source: q.source,
      order: q.order,
      codingConfig: q.codingConfig ? codingConfigSchema.parse(q.codingConfig) : null,
    })),
    publishedAt: new Date().toISOString(),
  });
}

/** Publish the current draft as a new immutable version (spec §94). */
export async function publishTemplate(ctx: ActorContext, templateId: string) {
  requirePermission(ctx, "template.write");
  await assertEntitled(ctx.companyId, "interviewer");
  return db.$transaction(async (tx) => {
    const template = await tx.interviewTemplate.findFirst({
      where: { id: templateId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!template) throw new AppError("NOT_FOUND", { message: "Interview not found." });
    const version = template.publishedVersion + 1;
    const snapshot = await buildSnapshot(tx, ctx, templateId, version);
    const created = await tx.interviewTemplateVersion.create({
      data: {
        templateId,
        version,
        snapshot: asJson(snapshot),
        scoringVersion: SCORING_VERSION,
        publishedById: ctx.userId,
      },
    });
    await tx.interviewTemplate.update({
      where: { id: templateId },
      data: { status: "PUBLISHED", publishedVersion: version, hasUnpublishedChanges: false },
    });
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.templatePublished,
        entityType: "interview_template",
        entityId: templateId,
        metadata: { version },
      },
      tx,
    );
    return created;
  });
}

export async function archiveTemplate(ctx: ActorContext, templateId: string): Promise<void> {
  requirePermission(ctx, "template.write");
  const result = await db.interviewTemplate.updateMany({
    where: { id: templateId, companyId: ctx.companyId },
    data: { status: "ARCHIVED" },
  });
  if (result.count === 0) throw new AppError("NOT_FOUND", { message: "Interview not found." });
  await audit(ctx, {
    action: AUDIT_ACTIONS.templateArchived,
    entityType: "interview_template",
    entityId: templateId,
  });
}

export async function latestTemplateVersion(templateId: string) {
  return db.interviewTemplateVersion.findFirst({
    where: { templateId },
    orderBy: { version: "desc" },
  });
}

// ───────────────────────── AI generation (spec §12, §82) ─────────────────────────

function normalizeDurations(sections: GeneratedInterview["sections"], total: number): number[] {
  const raw = sections.map((s) => Math.max(1, s.targetDurationMinutes));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const scaled = raw.map((m) => Math.max(1, Math.round((m * total) / sum)));
  const diff = total - scaled.reduce((a, b) => a + b, 0);
  const largest = scaled.indexOf(Math.max(...scaled));
  scaled[largest] = Math.max(1, (scaled[largest] ?? 1) + diff);
  return scaled;
}

export function generatedToDocument(
  generated: GeneratedInterview,
  job: { skills: Array<{ skillId: string; weight: number; skill: { name: string } }> },
  input: {
    durationMinutes: number;
    interviewType: TemplateDocument["type"];
    language: TemplateDocument["language"];
  },
  categoryWeights?: TemplateDocument["scoringConfig"]["categoryWeights"],
): TemplateDocument {
  const byName = new Map(job.skills.map((s) => [s.skill.name.trim().toLowerCase(), s]));
  const resolve = (name: string | null) =>
    name ? (byName.get(name.trim().toLowerCase())?.skillId ?? null) : null;
  const durations = normalizeDurations(generated.sections, input.durationMinutes);
  const sections = generated.sections.map((section, i) => {
    const focusSkillIds = [
      ...new Set(
        [
          ...section.focusSkills.map(resolve),
          ...section.questions.map((q) => resolve(q.skill)),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    const weight = job.skills
      .filter((s) => focusSkillIds.includes(s.skillId))
      .reduce((sum, s) => sum + s.weight, 0);
    const questionCount = section.questions.length;
    const maxQuestions = Math.max(1, Math.min(section.maxQuestions, questionCount + 3, 30));
    return {
      name: section.name,
      description: section.description || null,
      targetDurationMinutes: Math.min(60, durations[i] ?? 1),
      minQuestions: Math.min(section.minQuestions, maxQuestions, questionCount),
      maxQuestions,
      weight: Math.min(100, weight),
      focusSkillIds,
      questions: section.questions.slice(0, 40).map((q) =>
        questionInputSchema.parse({
          text: q.text,
          type: q.type,
          difficulty: q.difficulty,
          skillId: resolve(q.skill),
          weight: q.weight,
          expectedTopics: q.expectedTopics,
          idealAnswer: q.idealAnswer || null,
          redFlags: q.redFlags,
          followUpGuidance: q.followUpGuidance || null,
          mandatory: q.mandatory,
          source: "AI_GENERATED",
        }),
      ),
    };
  });
  const minQuestions = Math.max(
    1,
    sections.reduce((sum, s) => sum + s.minQuestions, 0),
  );
  const maxQuestions = Math.max(
    minQuestions,
    Math.min(
      60,
      sections.reduce((sum, s) => sum + s.maxQuestions, 0),
    ),
  );
  return templateDocumentSchema.parse({
    name: generated.name,
    description: generated.description || null,
    type: input.interviewType,
    durationMinutes: input.durationMinutes,
    minQuestions,
    maxQuestions,
    difficulty: "ADAPTIVE",
    language: input.language,
    sections,
    ...(categoryWeights ? { scoringConfig: { categoryWeights } } : {}),
  });
}

/** Generate an editable interview draft with AI. Nothing is saved until the recruiter saves it. */
export async function generateTemplateDraft(
  ctx: ActorContext,
  rawInput: GenerateTemplateInput,
): Promise<TemplateDocument> {
  requirePermission(ctx, "template.write");
  await assertEntitled(ctx.companyId, "interviewer");
  const input = generateTemplateSchema.parse(rawInput);
  if (!(await isFeatureEnabled(ctx.companyId, "aiQuestionGeneration"))) {
    throw new AppError("FORBIDDEN", {
      message: "AI interview generation is disabled for this workspace.",
    });
  }
  await rateLimit("aiGeneration", ctx.companyId);
  const job = await loadJobWithSkills(ctx, input.jobId);
  const context = jobContext(job);
  if (input.experienceLevel) context.experienceLevel = input.experienceLevel;
  try {
    const result = await getInterviewAI().generateInterview(
      {
        job: context,
        interviewType: input.interviewType,
        durationMinutes: input.durationMinutes,
        language: input.language,
        additionalInstructions: input.additionalInstructions,
      },
      { companyId: ctx.companyId },
    );
    const settings = parseCompanySettings(job.company.settings);
    return generatedToDocument(result.data, job, input, settings.categoryWeights);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("AI_UNAVAILABLE", {
      message: "We couldn't generate the interview right now. Please try again.",
      cause: error,
    });
  }
}

export async function regenerateQuestion(
  ctx: ActorContext,
  rawInput: RegenerateQuestionInput,
): Promise<QuestionData> {
  requirePermission(ctx, "template.write");
  await assertEntitled(ctx.companyId, "interviewer");
  const input = regenerateQuestionSchema.parse(rawInput);
  await rateLimit("aiGeneration", ctx.companyId);
  const job = await loadJobWithSkills(ctx, input.jobId);
  const skill = input.skillId ? job.skills.find((s) => s.skillId === input.skillId) : undefined;
  try {
    const result = await getInterviewAI().generateQuestion(
      {
        job: jobContext(job),
        sectionName: input.sectionName,
        skillName: skill?.skill.name ?? null,
        type: input.type,
        difficulty: input.difficulty,
        avoid: input.avoid,
        language: "en",
      },
      { companyId: ctx.companyId },
    );
    const q = result.data;
    return questionInputSchema.parse({
      text: q.text,
      type: q.type,
      difficulty: q.difficulty,
      skillId: skill?.skillId ?? null,
      weight: q.weight,
      expectedTopics: q.expectedTopics,
      idealAnswer: q.idealAnswer || null,
      redFlags: q.redFlags,
      followUpGuidance: q.followUpGuidance || null,
      mandatory: false,
      source: "AI_GENERATED",
    });
  } catch (error) {
    throw new AppError("AI_UNAVAILABLE", {
      message: "We couldn't generate a question right now. Please try again.",
      cause: error,
    });
  }
}
