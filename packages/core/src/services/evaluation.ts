import { asJson, db } from "@repo/database";
import type { EvaluationThread, FinalEvaluationOutput } from "@repo/ai";
import { templateSnapshotSchema, type TemplateSnapshot } from "@repo/interview-engine/snapshot";
import {
  aggregateScores,
  combineConfidence,
  confidenceLevel,
  deriveRecommendation,
  SCORING_VERSION,
} from "@repo/scoring";
import { AppError, logger, secondsBetween } from "@repo/shared";
import {
  evaluationFeedbackSchema,
  overrideEvaluationSchema,
  type EvaluationFeedbackInput,
  type OverrideEvaluationInput,
} from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { notifyCompanyMembers } from "../notifications";
import { getInterviewAI } from "../runtime";
import { latestParsedResume } from "./resumes";
import { jobQueue } from "@repo/queue";

interface ThreadBuild {
  threads: EvaluationThread[];
  answerIds: Set<string>;
  answersBySkill: Map<string, number>;
  answersByType: Map<string, number>;
  totalAnswers: number;
}

async function buildThreads(sessionId: string, snapshot: TemplateSnapshot): Promise<ThreadBuild> {
  const answers = await db.candidateAnswer.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    include: {
      message: { select: { content: true } },
      evaluations: { where: { phase: "INTERIM" }, take: 1 },
    },
  });
  const sectionName = (key: string | null) =>
    snapshot.sections.find((s) => s.key === key)?.name ?? null;
  const skillName = (key: string | null) =>
    snapshot.skills.find((s) => s.key === key)?.name ?? null;
  const byThread = new Map<string, EvaluationThread>();
  const answersBySkill = new Map<string, number>();
  const answersByType = new Map<string, number>();
  for (const answer of answers) {
    let thread = byThread.get(answer.threadKey);
    if (!thread) {
      thread = {
        threadKey: answer.threadKey,
        sectionName: sectionName(answer.sectionKey),
        skillKey: answer.skillKey,
        skillName: skillName(answer.skillKey),
        type: answer.questionType,
        difficulty: answer.difficulty,
        turns: [],
      };
      byThread.set(answer.threadKey, thread);
    }
    const interim = answer.evaluations[0];
    thread.turns.push({
      answerId: answer.id,
      question: answer.questionText,
      answer: answer.message.content,
      isFollowUp: answer.isFollowUp,
      interimScore: interim?.score ?? null,
      interimSummary: interim?.answerSummary || null,
      interimConfidence: interim?.confidence ?? null,
    });
    if (answer.skillKey)
      answersBySkill.set(answer.skillKey, (answersBySkill.get(answer.skillKey) ?? 0) + 1);
    answersByType.set(answer.questionType, (answersByType.get(answer.questionType) ?? 0) + 1);
  }
  return {
    threads: [...byThread.values()],
    answerIds: new Set(answers.map((a) => a.id)),
    answersBySkill,
    answersByType,
    totalAnswers: answers.length,
  };
}

/** Drop any evidence that doesn't reference a real answer (spec §121). */
function sanitizeEvaluation(
  output: FinalEvaluationOutput,
  built: ThreadBuild,
  snapshot: TemplateSnapshot,
) {
  const valid = (ids: string[]) => ids.filter((id) => built.answerIds.has(id));
  const validEvidence = <T extends { answerId: string }>(items: T[]) =>
    items.filter((e) => built.answerIds.has(e.answerId));
  const skillKeys = new Set(snapshot.skills.map((s) => s.key));
  const threadKeys = new Set(built.threads.map((t) => t.threadKey));
  let dropped = 0;
  const count = <T>(before: T[], after: T[]) => {
    dropped += before.length - after.length;
    return after;
  };
  return {
    output: {
      ...output,
      skills: output.skills
        .filter((s) => skillKeys.has(s.skillKey))
        .map((s) => ({ ...s, evidence: count(s.evidence, validEvidence(s.evidence)) })),
      communication: {
        ...output.communication,
        evidence: count(
          output.communication.evidence,
          validEvidence(output.communication.evidence),
        ),
      },
      problemSolving: {
        ...output.problemSolving,
        evidence: count(
          output.problemSolving.evidence,
          validEvidence(output.problemSolving.evidence),
        ),
      },
      experience: {
        ...output.experience,
        evidence: count(output.experience.evidence, validEvidence(output.experience.evidence)),
      },
      behavioral: {
        ...output.behavioral,
        evidence: count(output.behavioral.evidence, validEvidence(output.behavioral.evidence)),
      },
      questions: output.questions.filter((q) => threadKeys.has(q.threadKey)),
      strengths: output.strengths.map((s) => ({ ...s, answerIds: valid(s.answerIds) })),
      concerns: output.concerns.map((c) => ({ ...c, answerIds: valid(c.answerIds) })),
    },
    droppedEvidence: dropped,
  };
}

/**
 * Final evaluation (spec §38). Runs in the background worker; idempotent unless forced.
 */
export async function runFinalEvaluation(
  sessionId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const session = await db.interviewSession.findUnique({
    where: { id: sessionId },
    include: { templateVersion: true, evaluation: true, candidate: true },
  });
  if (!session) return;
  if (session.status !== "COMPLETED") throw new Error(`Session ${sessionId} is not completed`);
  if (session.evaluation?.status === "COMPLETED" && !options.force) return;

  const snapshot = templateSnapshotSchema.parse(session.templateVersion.snapshot);
  await db.interviewEvaluation.upsert({
    where: { sessionId },
    update: { status: "PROCESSING", attempts: { increment: 1 }, error: null },
    create: { sessionId, status: "PROCESSING", attempts: 1 },
  });

  try {
    const built = await buildThreads(sessionId, snapshot);
    const resume = await latestParsedResume(session.candidateId);
    const durationSeconds =
      session.startedAt && session.endedAt
        ? Math.max(0, secondsBetween(session.startedAt, session.endedAt) - session.pausedSeconds)
        : 0;
    const ai = getInterviewAI();
    const result = await ai.evaluateInterview(
      {
        job: {
          title: snapshot.job.title,
          companyName: snapshot.job.companyName,
          experienceLevel: snapshot.job.experienceLevel,
          description: snapshot.job.description,
          requirements: snapshot.job.requirements,
          responsibilities: snapshot.job.responsibilities,
          skills: snapshot.skills.map((s) => ({
            key: s.key,
            name: s.name,
            weight: s.weight,
            expectedLevel: s.expectedLevel,
            critical: s.critical,
          })),
        },
        interviewer: {
          name: snapshot.interviewerName,
          personality: snapshot.personality,
          language: snapshot.language,
          interviewType: snapshot.type,
          durationMinutes: snapshot.durationMinutes,
        },
        categoryWeights: snapshot.scoringConfig.categoryWeights,
        threads: built.threads,
        resume,
        completionReason: session.completionReason ?? "NORMAL",
        durationSeconds,
      },
      { companyId: session.companyId, sessionId },
    );
    const { output, droppedEvidence } = sanitizeEvaluation(result.data, built, snapshot);
    if (droppedEvidence > 0)
      logger.warn("evaluation.dropped_invalid_evidence", { sessionId, droppedEvidence });

    // Deterministic aggregation over model-provided, evidence-backed scores.
    const skillInputs = snapshot.skills.map((skill) => {
      const s = output.skills.find((x) => x.skillKey === skill.key);
      const objectiveCount = built.answersBySkill.get(skill.key) ?? 0;
      const insufficient = !s || s.insufficientEvidence || s.score === null || objectiveCount === 0;
      return {
        key: skill.key,
        weight: skill.weight,
        critical: skill.critical,
        score: insufficient ? null : s.score,
        confidence: s?.confidence ?? 0,
        evidenceCount: objectiveCount,
      };
    });
    const competency = (c: FinalEvaluationOutput["communication"], objective: number) => ({
      score: c.score,
      confidence: c.confidence,
      evidenceCount: Math.max(c.evidence.length, c.score === null ? 0 : Math.min(objective, 4)),
    });
    const behavioralCount =
      (built.answersByType.get("BEHAVIORAL") ?? 0) + (built.answersByType.get("SITUATIONAL") ?? 0);
    const aggregate = aggregateScores({
      categoryWeights: snapshot.scoringConfig.categoryWeights,
      skills: skillInputs,
      competencies: {
        communication: competency(output.communication, built.totalAnswers),
        problemSolving: competency(output.problemSolving, built.totalAnswers),
        experience: competency(
          output.experience,
          (built.answersByType.get("INTRODUCTION") ?? 0) +
            (built.answersByType.get("EXPERIENCE") ?? 0),
        ),
        behavioral:
          behavioralCount === 0 && output.behavioral.evidence.length === 0
            ? { score: null, confidence: 0, evidenceCount: 0 }
            : competency(output.behavioral, behavioralCount),
      },
    });
    const recommendation = deriveRecommendation(aggregate, {
      recommendation: output.recommendation,
      confidence: output.recommendationConfidence,
    });
    const now = new Date();

    await db.$transaction(async (tx) => {
      const evaluation = await tx.interviewEvaluation.update({
        where: { sessionId },
        data: {
          status: "COMPLETED",
          overallScore: aggregate.overallScore,
          recommendation: recommendation.recommendation,
          recommendationConfidence: recommendation.confidence,
          confidenceLevel: confidenceLevel(recommendation.confidence),
          summary: output.summary,
          strengths: asJson(output.strengths),
          concerns: asJson(output.concerns),
          communication: asJson(output.communication),
          behavioral: asJson(output.behavioral),
          followUpTopics: asJson(output.followUpTopics),
          resumeAlignment: asJson(
            resume ? output.resumeAlignment : { summary: "No resume was provided.", items: [] },
          ),
          categoryScores: asJson({
            ...aggregate.categories,
            problemSolvingDetail: output.problemSolving,
            experienceDetail: output.experience,
            reasons: recommendation.reasons,
            technicalCoverage: aggregate.technicalCoverage,
            overallConfidence: aggregate.overallConfidence,
            droppedEvidence,
          }),
          modelRecommendation: output.recommendation,
          templateVersion: snapshot.version,
          promptVersion: result.promptVersion,
          scoringVersion: SCORING_VERSION,
          provider: result.provider,
          model: result.model,
          generatedAt: now,
          error: null,
        },
      });
      await tx.skillEvaluation.deleteMany({ where: { evaluationId: evaluation.id } });
      await tx.skillEvaluation.createMany({
        data: aggregate.skills.map((skill) => {
          const snap = snapshot.skills.find((s) => s.key === skill.key)!;
          const model = output.skills.find((s) => s.skillKey === skill.key);
          return {
            evaluationId: evaluation.id,
            skillId: skill.key,
            skillKey: skill.key,
            skillName: snap.name,
            weight: snap.weight,
            expectedLevel: snap.expectedLevel,
            score: skill.score,
            confidence: skill.adjustedConfidence,
            confidenceLevel: confidenceLevel(skill.adjustedConfidence),
            evidenceCount: skill.evidenceCount,
            evidence: asJson(
              (model?.evidence ?? []).map((e) => ({ ...e, summary: model?.summary ?? null })),
            ),
            insufficientEvidence: skill.score === null,
          };
        }),
      });
      await tx.questionEvaluation.deleteMany({ where: { sessionId, phase: "FINAL" } });
      await tx.questionEvaluation.createMany({
        data: built.threads.map((thread) => {
          const q = output.questions.find((x) => x.threadKey === thread.threadKey);
          const firstTurn = thread.turns[0]!;
          return {
            sessionId,
            evaluationId: evaluation.id,
            phase: "FINAL" as const,
            threadKey: thread.threadKey,
            questionText: firstTurn.question,
            skillKey: thread.skillKey,
            difficulty: thread.difficulty,
            score: q?.score ?? null,
            confidence: q?.score == null ? 0 : combineConfidence(0.8, thread.turns.length),
            answerSummary: q?.answerSummary ?? "",
            assessment: q?.assessment ?? "Not assessed.",
            insufficientEvidence: q ? q.insufficientEvidence : true,
            promptVersion: result.promptVersion,
          };
        }),
      });
      await notifyCompanyMembers(
        {
          companyId: session.companyId,
          type: "EVALUATION_READY",
          title:
            `Evaluation ready: ${session.candidate.firstName} ${session.candidate.lastName}`.trim(),
          body: `${snapshot.job.title} — AI-generated evaluation is ready for review.`,
          link: `/interviews/${sessionId}`,
          dedupeKey: `evaluation-ready:${sessionId}:${evaluation.attempts}`,
          roles: ["COMPANY_ADMIN", "RECRUITER", "HIRING_MANAGER"],
        },
        tx,
      );
    });
  } catch (error) {
    const evaluation = await db.interviewEvaluation.update({
      where: { sessionId },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 1_000) : "Evaluation failed",
      },
    });
    logger.error("evaluation.failed", { sessionId, attempts: evaluation.attempts, error });
    throw error;
  }
}

// ───────────────────────── human-in-the-loop (spec §57, §126) ─────────────────────────

export async function overrideEvaluation(
  ctx: ActorContext,
  sessionId: string,
  rawInput: OverrideEvaluationInput,
) {
  requirePermission(ctx, "results.override");
  const input = overrideEvaluationSchema.parse(rawInput);
  const evaluation = await db.interviewEvaluation.findFirst({
    where: { sessionId, session: { companyId: ctx.companyId } },
  });
  if (!evaluation) throw new AppError("NOT_FOUND", { message: "Evaluation not found." });
  const updated = await db.interviewEvaluation.update({
    where: { id: evaluation.id },
    data: {
      ...(input.score !== undefined ? { overriddenScore: input.score } : {}),
      ...(input.recommendation !== undefined
        ? { overriddenRecommendation: input.recommendation }
        : {}),
      overrideReason: input.reason,
      overriddenById: ctx.userId,
      overriddenAt: new Date(),
    },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.evaluationOverridden,
    entityType: "interview_evaluation",
    entityId: evaluation.id,
    metadata: {
      from: {
        score: evaluation.overriddenScore ?? evaluation.overallScore,
        recommendation: evaluation.overriddenRecommendation ?? evaluation.recommendation,
      },
      to: { score: input.score, recommendation: input.recommendation },
      reason: input.reason,
    },
  });
  return updated;
}

export async function submitEvaluationFeedback(
  ctx: ActorContext,
  sessionId: string,
  rawInput: EvaluationFeedbackInput,
) {
  requirePermission(ctx, "feedback.write");
  const input = evaluationFeedbackSchema.parse(rawInput);
  const evaluation = await db.interviewEvaluation.findFirst({
    where: { sessionId, session: { companyId: ctx.companyId } },
  });
  if (!evaluation) throw new AppError("NOT_FOUND", { message: "Evaluation not found." });
  return db.evaluationFeedback.upsert({
    where: { evaluationId_userId: { evaluationId: evaluation.id, userId: ctx.userId } },
    update: { accuracy: input.accuracy, correction: input.correction },
    create: {
      evaluationId: evaluation.id,
      userId: ctx.userId,
      accuracy: input.accuracy,
      correction: input.correction,
    },
  });
}

export async function requestReevaluation(ctx: ActorContext, sessionId: string): Promise<void> {
  requirePermission(ctx, "results.override");
  const session = await db.interviewSession.findFirst({
    where: { id: sessionId, companyId: ctx.companyId, status: "COMPLETED" },
  });
  if (!session) throw new AppError("NOT_FOUND", { message: "Interview not found." });
  await jobQueue.enqueue(
    "interview.evaluate",
    { sessionId, force: true },
    { uniqueKey: `evaluate:${sessionId}:${Date.now()}`, maxAttempts: 3 },
  );
  await db.interviewEvaluation.updateMany({ where: { sessionId }, data: { status: "PENDING" } });
  await audit(ctx, {
    action: AUDIT_ACTIONS.evaluationRerun,
    entityType: "interview_session",
    entityId: sessionId,
  });
}
