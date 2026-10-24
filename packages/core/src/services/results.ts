import { db } from "@repo/database";
import { templateSnapshotSchema } from "@repo/interview-engine/snapshot";
import { parsedResumeSchema } from "@repo/ai";
import {
  AppError,
  secondsBetween,
  type IntegrityEventType,
  type Recommendation,
} from "@repo/shared";
import {
  parseCompanySettings,
  recruiterNoteSchema,
  type RecruiterNoteInput,
} from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../audit";
import { can, requirePermission, type ActorContext } from "../context";

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asObject = <T extends object>(value: unknown): T =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);

export interface EvidenceItem {
  title: string;
  evidence: string;
  answerIds: string[];
}

/** Full recruiter report for one interview (spec §43, §109). Never includes hidden reasoning. */
export async function getInterviewReport(ctx: ActorContext, sessionId: string) {
  requirePermission(ctx, "results.read");
  const session = await db.interviewSession.findFirst({
    where: { id: sessionId, companyId: ctx.companyId, deletedAt: null },
    include: {
      candidate: true,
      application: { include: { job: { select: { id: true, title: true } } } },
      templateVersion: { include: { template: { select: { id: true, name: true } } } },
      evaluation: {
        include: {
          skillEvaluations: { orderBy: { weight: "desc" } },
          feedback: { where: { userId: ctx.userId } },
        },
      },
      messages: { orderBy: { sequenceNumber: "asc" } },
      answers: { orderBy: { createdAt: "asc" } },
      questionEvals: { orderBy: { createdAt: "asc" } },
      recordings: {
        where: { deletedAt: null },
        select: { id: true, messageId: true, durationMs: true, offsetMs: true, mimeType: true },
      },
      integrityEvents: { orderBy: { occurredAt: "asc" } },
      company: { select: { settings: true } },
    },
  });
  if (!session || session.candidate.deletedAt)
    throw new AppError("NOT_FOUND", { message: "Interview not found." });

  const snapshot = templateSnapshotSchema.parse(session.templateVersion.snapshot);
  const settings = parseCompanySettings(session.company.settings);
  const showAi =
    ctx.role !== "REVIEWER" ||
    (settings.showAiEvaluationToReviewers && snapshot.aiSettings.showEvaluationToReviewers);

  const startedAt = session.startedAt;
  const transcript = session.messages
    .filter((m) => m.role !== "SYSTEM_EVENT")
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      offsetSeconds: startedAt ? Math.max(0, secondsBetween(startedAt, m.createdAt)) : 0,
      recordingId: session.recordings.find((r) => r.messageId === m.id)?.id ?? null,
    }));

  const answerMessage = new Map(session.answers.map((a) => [a.id, a.messageId]));
  const contentByMessage = new Map(session.messages.map((m) => [m.id, m.content]));
  const finalEvals = session.questionEvals.filter((q) => q.phase === "FINAL");
  const interimByAnswer = new Map(
    session.questionEvals.filter((q) => q.phase === "INTERIM").map((q) => [q.answerId, q]),
  );
  const threadKeys = [...new Set(session.answers.map((a) => a.threadKey))];
  const skillName = (key: string | null) =>
    snapshot.skills.find((s) => s.key === key)?.name ?? null;
  const questions = threadKeys.map((threadKey) => {
    const answers = session.answers.filter((a) => a.threadKey === threadKey);
    const first = answers[0]!;
    const final = finalEvals.find((q) => q.threadKey === threadKey);
    return {
      threadKey,
      questionText: first.questionText,
      type: first.questionType,
      difficulty: first.difficulty,
      skillName: skillName(first.skillKey),
      score: showAi ? (final?.score ?? null) : null,
      assessment: showAi ? (final?.assessment ?? null) : null,
      answerSummary: showAi ? (final?.answerSummary ?? null) : null,
      insufficientEvidence: final?.insufficientEvidence ?? false,
      turns: answers.map((a) => ({
        answerId: a.id,
        question: a.questionText,
        answer: contentByMessage.get(answerMessage.get(a.id) ?? "") ?? "",
        isFollowUp: a.isFollowUp,
        source: a.source,
        interimScore: showAi ? (interimByAnswer.get(a.id)?.score ?? null) : null,
        createdAt: a.createdAt,
      })),
    };
  });

  const evaluation = session.evaluation;
  const integrityByType: Partial<Record<IntegrityEventType, number>> = {};
  for (const event of session.integrityEvents)
    integrityByType[event.type] = (integrityByType[event.type] ?? 0) + 1;

  const resumeRow = await db.candidateResume.findFirst({
    where: { candidateId: session.candidateId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const parsedResume = resumeRow?.parsedData
    ? parsedResumeSchema.safeParse(resumeRow.parsedData)
    : null;

  const [notes, activity] = await Promise.all([
    db.recruiterNote.findMany({
      where: { candidateId: session.candidateId, companyId: ctx.companyId, deletedAt: null },
      include: { author: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({
      where: {
        companyId: ctx.companyId,
        OR: [
          { entityType: "application", entityId: session.applicationId },
          { entityType: "candidate", entityId: session.candidateId },
          { entityType: "interview_session", entityId: session.id },
          { entityType: "interview_evaluation", entityId: evaluation?.id ?? "-" },
          { entityType: "interview_invitation", entityId: session.invitationId },
        ],
      },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const durationSeconds = session.startedAt
    ? Math.max(
        0,
        secondsBetween(session.startedAt, session.endedAt ?? new Date()) - session.pausedSeconds,
      )
    : 0;

  return {
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds,
      completionReason: session.completionReason,
      attemptNumber: session.attemptNumber,
      language: session.language,
      responseMode: session.responseMode,
      recordingEnabled: session.recordingEnabled,
      questionsAsked: session.questionsAsked,
      followUpsAsked: session.followUpsAsked,
      reconnectCount: session.reconnectCount,
      templateName: session.templateVersion.template.name,
      templateId: session.templateVersion.template.id,
      templateVersion: session.templateVersion.version,
      interviewerName: snapshot.interviewerName,
      plannedMinutes: snapshot.durationMinutes,
    },
    candidate: {
      id: session.candidate.id,
      firstName: session.candidate.firstName,
      lastName: session.candidate.lastName,
      email: session.candidate.email,
      phone: session.candidate.phone,
      linkedinUrl: session.candidate.linkedinUrl,
      location: session.candidate.location,
    },
    application: {
      id: session.application.id,
      stage: session.application.stage,
      manualRating: session.application.manualRating,
    },
    job: session.application.job,
    showAiEvaluation: showAi,
    evaluation:
      evaluation && showAi
        ? {
            id: evaluation.id,
            status: evaluation.status,
            overallScore: evaluation.overallScore,
            effectiveScore: evaluation.overriddenScore ?? evaluation.overallScore,
            recommendation: evaluation.recommendation,
            effectiveRecommendation: (evaluation.overriddenRecommendation ??
              evaluation.recommendation) as Recommendation | null,
            recommendationConfidence: evaluation.recommendationConfidence,
            confidenceLevel: evaluation.confidenceLevel,
            summary: evaluation.summary,
            strengths: asArray<EvidenceItem>(evaluation.strengths),
            concerns: asArray<EvidenceItem>(evaluation.concerns),
            communication: asObject<{
              score?: number | null;
              confidence?: number;
              summary?: string;
            }>(evaluation.communication),
            behavioral: asObject<{ score?: number | null; confidence?: number; summary?: string }>(
              evaluation.behavioral,
            ),
            followUpTopics: asArray<string>(evaluation.followUpTopics),
            resumeAlignment: asObject<{
              summary?: string;
              items?: Array<{ claim: string; interviewEvidence: string; alignment: string }>;
            }>(evaluation.resumeAlignment),
            categoryScores: asObject<
              Record<
                string,
                {
                  score: number | null;
                  confidence: number;
                  weight: number;
                  effectiveWeight: number;
                }
              > & { reasons?: string[] }
            >(evaluation.categoryScores),
            override: evaluation.overriddenAt
              ? {
                  score: evaluation.overriddenScore,
                  recommendation: evaluation.overriddenRecommendation,
                  reason: evaluation.overrideReason,
                  at: evaluation.overriddenAt,
                  byUserId: evaluation.overriddenById,
                }
              : null,
            versions: {
              prompt: evaluation.promptVersion,
              scoring: evaluation.scoringVersion,
              template: evaluation.templateVersion,
            },
            provider: evaluation.provider,
            model: evaluation.model,
            generatedAt: evaluation.generatedAt,
            error:
              evaluation.status === "FAILED"
                ? "The evaluation could not be generated. You can retry it."
                : null,
            myFeedback: evaluation.feedback[0] ?? null,
            skills: evaluation.skillEvaluations.map((s) => ({
              skillKey: s.skillKey,
              skillName: s.skillName,
              weight: s.weight,
              expectedLevel: s.expectedLevel,
              score: s.score,
              confidence: s.confidence,
              confidenceLevel: s.confidenceLevel,
              evidenceCount: s.evidenceCount,
              insufficientEvidence: s.insufficientEvidence,
              evidence: asArray<{ answerId: string; assessment: string; summary?: string | null }>(
                s.evidence,
              ),
            })),
          }
        : evaluation
          ? { id: evaluation.id, status: evaluation.status, hidden: true as const }
          : null,
    questions,
    transcript,
    integrity: {
      enabled: snapshot.aiSettings.integrityMonitoring && settings.integrityMonitoring,
      total: session.integrityEvents.length,
      byType: integrityByType,
      events: session.integrityEvents
        .slice(0, 200)
        .map((e) => ({ id: e.id, type: e.type, occurredAt: e.occurredAt })),
    },
    resume: resumeRow
      ? {
          id: resumeRow.id,
          filename: resumeRow.originalFilename,
          parseStatus: resumeRow.parseStatus,
          parsed: parsedResume?.success ? parsedResume.data : null,
        }
      : null,
    notes,
    activity,
    permissions: {
      override: can(ctx, "results.override"),
      stage: can(ctx, "stage.update"),
      note: can(ctx, "note.write"),
      feedback: can(ctx, "feedback.write"),
      terminate: can(ctx, "session.terminate"),
    },
  };
}

export type InterviewReport = Awaited<ReturnType<typeof getInterviewReport>>;

/** Candidate comparison for a job (spec §40). Ranks only on job-relevant evidence. */
export async function compareCandidates(
  ctx: ActorContext,
  jobId: string,
  sessionIds: string[] = [],
) {
  requirePermission(ctx, "results.read");
  const job = await db.job.findFirst({
    where: { id: jobId, companyId: ctx.companyId, deletedAt: null },
    include: { skills: { include: { skill: true }, orderBy: { weight: "desc" } } },
  });
  if (!job) throw new AppError("NOT_FOUND", { message: "Job not found." });
  const sessions = await db.interviewSession.findMany({
    where: {
      companyId: ctx.companyId,
      status: "COMPLETED",
      application: { jobId },
      evaluation: { status: "COMPLETED" },
      candidate: { deletedAt: null },
      ...(sessionIds.length > 0 ? { id: { in: sessionIds } } : {}),
    },
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true } },
      application: { select: { id: true, stage: true } },
      evaluation: { include: { skillEvaluations: true } },
    },
    orderBy: { endedAt: "desc" },
  });
  // Latest completed interview per application.
  const latest = new Map<string, (typeof sessions)[number]>();
  for (const s of sessions) if (!latest.has(s.applicationId)) latest.set(s.applicationId, s);

  const rows = [...latest.values()].map((s) => {
    const e = s.evaluation!;
    const categories = asObject<Record<string, { score: number | null; confidence: number }>>(
      e.categoryScores,
    );
    return {
      sessionId: s.id,
      applicationId: s.application.id,
      candidateId: s.candidate.id,
      name: `${s.candidate.firstName} ${s.candidate.lastName}`.trim(),
      stage: s.application.stage,
      interviewedAt: s.endedAt,
      overall: e.overriddenScore ?? e.overallScore,
      overridden: e.overriddenScore !== null || e.overriddenRecommendation !== null,
      recommendation: (e.overriddenRecommendation ?? e.recommendation) as Recommendation | null,
      confidenceLevel: e.confidenceLevel,
      communication: categories.communication?.score ?? null,
      problemSolving: categories.problemSolving?.score ?? null,
      skills: Object.fromEntries(
        e.skillEvaluations.map((sk) => [
          sk.skillKey,
          { score: sk.score, confidenceLevel: sk.confidenceLevel, evidenceCount: sk.evidenceCount },
        ]),
      ),
    };
  });
  rows.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  return {
    job: { id: job.id, title: job.title },
    skills: job.skills.map((s) => ({ key: s.skillId, name: s.skill.name, weight: s.weight })),
    rows,
  };
}

// ───────────────────────── notes (spec §111) ─────────────────────────

export async function addRecruiterNote(
  ctx: ActorContext,
  candidateId: string,
  rawInput: RecruiterNoteInput,
) {
  requirePermission(ctx, "note.write");
  const input = recruiterNoteSchema.parse(rawInput);
  const candidate = await db.candidate.findFirst({
    where: { id: candidateId, companyId: ctx.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!candidate) throw new AppError("NOT_FOUND", { message: "Candidate not found." });
  const note = await db.recruiterNote.create({
    data: {
      companyId: ctx.companyId,
      candidateId,
      applicationId: input.applicationId ?? null,
      sessionId: input.sessionId ?? null,
      authorId: ctx.userId,
      content: input.content,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.noteAdded,
    entityType: "candidate",
    entityId: candidateId,
  });
  return note;
}

export async function deleteRecruiterNote(ctx: ActorContext, noteId: string): Promise<void> {
  requirePermission(ctx, "note.write");
  const note = await db.recruiterNote.findFirst({
    where: { id: noteId, companyId: ctx.companyId, deletedAt: null },
  });
  if (!note) throw new AppError("NOT_FOUND", { message: "Note not found." });
  if (note.authorId !== ctx.userId && ctx.role !== "COMPANY_ADMIN")
    throw new AppError("FORBIDDEN", { message: "You can only delete your own notes." });
  await db.recruiterNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
}

export async function listInterviews(
  ctx: ActorContext,
  options: {
    status?: "ACTIVE" | "COMPLETED" | "ALL";
    jobId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  requirePermission(ctx, "results.read");
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const where = {
    companyId: ctx.companyId,
    deletedAt: null,
    candidate: { deletedAt: null },
    ...(options.jobId ? { application: { jobId: options.jobId } } : {}),
    ...(options.status === "COMPLETED"
      ? { status: "COMPLETED" as const }
      : options.status === "ACTIVE"
        ? { status: { notIn: ["COMPLETED" as const, "FAILED" as const, "EXPIRED" as const] } }
        : {}),
  };
  const [items, total] = await Promise.all([
    db.interviewSession.findMany({
      where,
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        application: { select: { job: { select: { id: true, title: true } } } },
        evaluation: {
          select: {
            status: true,
            overallScore: true,
            overriddenScore: true,
            recommendation: true,
            overriddenRecommendation: true,
            confidenceLevel: true,
          },
        },
        _count: { select: { integrityEvents: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.interviewSession.count({ where }),
  ]);
  return { items, total, page, pageSize };
}
