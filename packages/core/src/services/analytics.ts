import { db } from "@repo/database";
import { CANDIDATE_STAGES } from "@repo/shared";
import { requirePermission, type ActorContext } from "../context";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

/** Recruiter dashboard metrics (spec §41). */
export async function getDashboard(ctx: ActorContext) {
  requirePermission(ctx, "analytics.read");
  const companyId = ctx.companyId;
  const [
    activeJobs,
    interviewsThisWeek,
    completedTotal,
    completed30,
    awaitingReview,
    pipelineRaw,
    avgScore,
    invitations30,
    recentSessions,
    skillScores,
    weekly,
  ] = await Promise.all([
    db.job.count({ where: { companyId, status: "ACTIVE", deletedAt: null } }),
    db.interviewSession.count({ where: { companyId, startedAt: { gte: daysAgo(7) } } }),
    db.interviewSession.count({ where: { companyId, status: "COMPLETED" } }),
    db.interviewSession.count({
      where: { companyId, status: "COMPLETED", endedAt: { gte: daysAgo(30) } },
    }),
    db.application.count({
      where: {
        job: { companyId, deletedAt: null },
        candidate: { deletedAt: null },
        stage: { in: ["COMPLETED", "UNDER_REVIEW"] },
      },
    }),
    db.application.groupBy({
      by: ["stage"],
      where: { job: { companyId, deletedAt: null }, candidate: { deletedAt: null } },
      _count: { _all: true },
    }),
    db.interviewEvaluation.aggregate({
      where: {
        session: { companyId },
        status: "COMPLETED",
        overallScore: { not: null },
        generatedAt: { gte: daysAgo(90) },
      },
      _avg: { overallScore: true },
    }),
    db.interviewInvitation.count({
      where: { candidate: { companyId }, createdAt: { gte: daysAgo(30) } },
    }),
    db.interviewSession.findMany({
      where: { companyId, candidate: { deletedAt: null } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        candidate: { select: { firstName: true, lastName: true } },
        application: { select: { job: { select: { title: true } } } },
        evaluation: {
          select: {
            status: true,
            overallScore: true,
            overriddenScore: true,
            recommendation: true,
            overriddenRecommendation: true,
          },
        },
      },
    }),
    db.skillEvaluation.groupBy({
      by: ["skillName"],
      where: { evaluation: { session: { companyId }, status: "COMPLETED" }, score: { not: null } },
      _avg: { score: true },
      _count: { _all: true },
      orderBy: { _count: { skillName: "desc" } },
      take: 8,
    }),
    db.$queryRaw<Array<{ week: Date; completed: bigint; avgScore: number | null }>>`
        SELECT date_trunc('week', s."endedAt") AS week, COUNT(*) AS completed,
               AVG(COALESCE(e."overriddenScore", e."overallScore"))::float AS "avgScore"
        FROM "interview_session" s
        LEFT JOIN "interview_evaluation" e ON e."sessionId" = s."id" AND e."status" = 'COMPLETED'
        WHERE s."companyId" = ${companyId} AND s."status" = 'COMPLETED' AND s."endedAt" >= ${daysAgo(84)}
        GROUP BY 1 ORDER BY 1`,
  ]);
  const pipeline = CANDIDATE_STAGES.map((stage) => ({
    stage,
    count: pipelineRaw.find((p) => p.stage === stage)?._count._all ?? 0,
  }));
  return {
    cards: {
      activeJobs,
      interviewsThisWeek,
      completedInterviews: completedTotal,
      awaitingReview,
    },
    completionRate: invitations30 > 0 ? Math.round((completed30 / invitations30) * 100) : null,
    averageScore:
      avgScore._avg.overallScore === null ? null : Math.round(avgScore._avg.overallScore),
    pipeline,
    skillScores: skillScores.map((s) => ({
      skill: s.skillName,
      average: Math.round(s._avg.score ?? 0),
      count: s._count._all,
    })),
    weekly: weekly.map((w) => ({
      week: w.week,
      completed: Number(w.completed),
      averageScore: w.avgScore === null ? null : Math.round(w.avgScore),
    })),
    recent: recentSessions.map((s) => ({
      sessionId: s.id,
      candidate: `${s.candidate.firstName} ${s.candidate.lastName}`.trim(),
      job: s.application.job.title,
      status: s.status,
      updatedAt: s.updatedAt,
      score: s.evaluation?.overriddenScore ?? s.evaluation?.overallScore ?? null,
      recommendation:
        s.evaluation?.overriddenRecommendation ?? s.evaluation?.recommendation ?? null,
      evaluationStatus: s.evaluation?.status ?? null,
    })),
  };
}

/** Company analytics (spec §67). Aggregates only — no demographic profiling. */
export async function getCompanyAnalytics(
  ctx: ActorContext,
  options: { days?: number; jobId?: string } = {},
) {
  requirePermission(ctx, "analytics.read");
  const since = daysAgo(options.days ?? 90);
  const companyId = ctx.companyId;
  const jobFilter = options.jobId ? { application: { jobId: options.jobId } } : {};
  const [
    invitations,
    invitationsByStatus,
    sessions,
    completedSessions,
    reasons,
    scoreRows,
    durationRow,
    perJob,
    dropOff,
    feedback,
  ] = await Promise.all([
    db.interviewInvitation.count({
      where: {
        candidate: { companyId },
        createdAt: { gte: since },
        ...(options.jobId ? { application: { jobId: options.jobId } } : {}),
      },
    }),
    db.interviewInvitation.groupBy({
      by: ["status"],
      where: {
        candidate: { companyId },
        createdAt: { gte: since },
        ...(options.jobId ? { application: { jobId: options.jobId } } : {}),
      },
      _count: { _all: true },
    }),
    db.interviewSession.count({ where: { companyId, createdAt: { gte: since }, ...jobFilter } }),
    db.interviewSession.count({
      where: { companyId, status: "COMPLETED", endedAt: { gte: since }, ...jobFilter },
    }),
    db.interviewSession.groupBy({
      by: ["completionReason"],
      where: { companyId, status: "COMPLETED", endedAt: { gte: since }, ...jobFilter },
      _count: { _all: true },
    }),
    db.interviewEvaluation.findMany({
      where: {
        status: "COMPLETED",
        session: { companyId, endedAt: { gte: since }, ...jobFilter },
        overallScore: { not: null },
      },
      select: {
        overallScore: true,
        overriddenScore: true,
        recommendation: true,
        overriddenRecommendation: true,
      },
    }),
    db.$queryRaw<Array<{ avg: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")) - "pausedSeconds")::float AS avg
      FROM "interview_session" WHERE "companyId" = ${companyId} AND "status" = 'COMPLETED' AND "endedAt" >= ${since} AND "startedAt" IS NOT NULL`,
    db.job.findMany({
      where: { companyId, deletedAt: null, ...(options.jobId ? { id: options.jobId } : {}) },
      select: { id: true, title: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.interviewSession.groupBy({
      by: ["currentSectionKey"],
      where: {
        companyId,
        createdAt: { gte: since },
        ...jobFilter,
        OR: [
          { status: "EXPIRED" },
          { completionReason: { in: ["TECHNICAL_FAILURE", "CANDIDATE_ENDED"] } },
        ],
      },
      _count: { _all: true },
    }),
    db.candidateFeedback.aggregate({
      where: { session: { companyId, createdAt: { gte: since } } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const buckets = [0, 20, 40, 60, 80].map((min) => ({
    range: `${min}–${min + (min === 80 ? 20 : 19)}`,
    count: 0,
  }));
  const recommendations: Record<string, number> = {};
  for (const row of scoreRows) {
    const score = row.overriddenScore ?? row.overallScore ?? 0;
    const index = Math.min(4, Math.floor(score / 20));
    buckets[index]!.count += 1;
    const rec = row.overriddenRecommendation ?? row.recommendation ?? "INSUFFICIENT_EVIDENCE";
    recommendations[rec] = (recommendations[rec] ?? 0) + 1;
  }
  const expired = invitationsByStatus.find((s) => s.status === "EXPIRED")?._count._all ?? 0;
  const sectionNames = new Map<string, string>();
  const sectionKeys = dropOff
    .map((d) => d.currentSectionKey)
    .filter((k): k is string => Boolean(k));
  if (sectionKeys.length > 0) {
    const sections = await db.interviewSection.findMany({
      where: { id: { in: sectionKeys } },
      select: { id: true, name: true },
    });
    for (const s of sections) sectionNames.set(s.id, s.name);
  }
  const scores = scoreRows.map((r) => r.overriddenScore ?? r.overallScore ?? 0);
  return {
    invitationsSent: invitations,
    interviewsStarted: sessions,
    interviewsCompleted: completedSessions,
    completionRate: invitations > 0 ? Math.round((completedSessions / invitations) * 100) : null,
    noShowRate: invitations > 0 ? Math.round((expired / invitations) * 100) : null,
    averageDurationMinutes: durationRow[0]?.avg ? Math.round(durationRow[0].avg / 60) : null,
    averageScore:
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    scoreDistribution: buckets,
    recommendations,
    completionReasons: reasons.map((r) => ({
      reason: r.completionReason ?? "UNKNOWN",
      count: r._count._all,
    })),
    dropOff: dropOff.map((d) => ({
      section: d.currentSectionKey
        ? (sectionNames.get(d.currentSectionKey) ?? "Unknown section")
        : "Before first question",
      count: d._count._all,
    })),
    candidatesPerJob: perJob.map((j) => ({
      jobId: j.id,
      title: j.title,
      candidates: j._count.applications,
    })),
    candidateExperience: {
      averageRating: feedback._avg.rating ? Math.round(feedback._avg.rating * 10) / 10 : null,
      responses: feedback._count._all,
    },
    skillAverages: await db.skillEvaluation
      .groupBy({
        by: ["skillName"],
        where: {
          score: { not: null },
          evaluation: {
            status: "COMPLETED",
            session: { companyId, endedAt: { gte: since }, ...jobFilter },
          },
        },
        _avg: { score: true, confidence: true },
        _count: { _all: true },
      })
      .then((rows) =>
        rows.map((r) => ({
          skill: r.skillName,
          average: Math.round(r._avg.score ?? 0),
          confidence: Math.round((r._avg.confidence ?? 0) * 100) / 100,
          count: r._count._all,
        })),
      ),
  };
}
