import { describe, expect, it } from "vitest";
import { db } from "@repo/database";
import {
  addMember,
  AVERAGE_CANDIDATE,
  beginInterview,
  completeInterview,
  createWorkspace,
  inviteCandidate,
  STRONG_CANDIDATE,
} from "../testing/fixtures";
import { endInterviewByCandidate } from "./candidate-session";
import { overrideEvaluation, runFinalEvaluation } from "./evaluation";
import { compareCandidates, getInterviewReport } from "./results";

async function evaluatedInterview(
  answers = STRONG_CANDIDATE,
  person?: { firstName: string; lastName: string; email: string },
) {
  const ws = await createWorkspace();
  const invite = await inviteCandidate(ws.admin, ws.template.id, person);
  const done = await completeInterview(invite.token, answers);
  await runFinalEvaluation(done.sessionId);
  return { ...ws, sessionId: done.sessionId };
}

describe("final evaluation & results", () => {
  it("produces scores, per-skill evidence and a recommendation", async () => {
    const { admin, sessionId } = await evaluatedInterview();
    const evaluation = await db.interviewEvaluation.findUniqueOrThrow({
      where: { sessionId },
      include: { skillEvaluations: true },
    });
    expect(evaluation.status).toBe("COMPLETED");
    expect(evaluation.overallScore).toBeGreaterThan(0);
    expect(evaluation.recommendation).toBeTruthy();
    expect(evaluation.scoringVersion).toBeTruthy();
    expect(evaluation.skillEvaluations.length).toBe(5);
    expect(evaluation.skillEvaluations.some((s) => s.evidenceCount > 0)).toBe(true);

    const report = await getInterviewReport(admin, sessionId);
    expect(
      report.evaluation && "skills" in report.evaluation
        ? (report.evaluation.skills?.length ?? 0)
        : 0,
    ).toBe(5);
    expect(report.transcript.length).toBeGreaterThan(5);
  });

  it("re-running the evaluation is idempotent unless forced", async () => {
    const { sessionId } = await evaluatedInterview();
    const before = await db.interviewEvaluation.findUniqueOrThrow({ where: { sessionId } });
    await runFinalEvaluation(sessionId);
    const after = await db.interviewEvaluation.findUniqueOrThrow({ where: { sessionId } });
    expect(after.id).toBe(before.id);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("marks an interview with no answers as insufficient evidence", async () => {
    const ws = await createWorkspace();
    const invite = await inviteCandidate(ws.admin, ws.template.id);
    const started = await beginInterview(invite.token);
    await endInterviewByCandidate(await started.load());
    await runFinalEvaluation(started.sessionId);
    const evaluation = await db.interviewEvaluation.findUniqueOrThrow({
      where: { sessionId: started.sessionId },
    });
    expect(evaluation.recommendation).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("ranks a strong candidate above a weak one in comparison", async () => {
    const ws = await createWorkspace();
    const strong = await inviteCandidate(ws.admin, ws.template.id, {
      firstName: "Sarah",
      lastName: "Chen",
      email: "sarah@example.com",
    });
    const weak = await inviteCandidate(ws.admin, ws.template.id, {
      firstName: "John",
      lastName: "Miller",
      email: "john@example.com",
    });
    const a = await completeInterview(strong.token, STRONG_CANDIDATE);
    const b = await completeInterview(weak.token, AVERAGE_CANDIDATE);
    await runFinalEvaluation(a.sessionId);
    await runFinalEvaluation(b.sessionId);

    const comparison = await compareCandidates(ws.admin, ws.job.id);
    expect(comparison.rows.map((r) => r.name)).toEqual(["Sarah Chen", "John Miller"]);
    expect(comparison.rows[0]!.overall!).toBeGreaterThan(comparison.rows[1]!.overall!);
  });

  it("human overrides are recorded with a reason and audited", async () => {
    const { admin, sessionId } = await evaluatedInterview();
    await overrideEvaluation(admin, sessionId, {
      score: 55,
      recommendation: "BORDERLINE",
      reason: "Follow-up call showed gaps in Spring Security.",
    });
    const evaluation = await db.interviewEvaluation.findUniqueOrThrow({ where: { sessionId } });
    expect(evaluation.overriddenScore).toBe(55);
    expect(evaluation.overriddenById).toBe(admin.userId);
    expect(evaluation.overallScore).not.toBe(55); // the AI score is preserved
    const log = await db.auditLog.findFirst({
      where: { action: "evaluation.overridden", entityId: evaluation.id },
    });
    expect(log).not.toBeNull();
  });

  it("enforces tenant isolation and role permissions on results", async () => {
    const { admin, company, sessionId } = await evaluatedInterview();
    const other = await createWorkspace("Other Corp");
    await expect(getInterviewReport(other.admin, sessionId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const reviewer = await addMember(company.id, "REVIEWER", "reviewer@nova.test");
    await expect(getInterviewReport(reviewer, sessionId)).resolves.toBeTruthy();
    await expect(
      overrideEvaluation(reviewer, sessionId, { score: 99, reason: "I like them a lot" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await db.interviewEvaluation.findUniqueOrThrow({ where: { sessionId } })).overriddenScore,
    ).toBeNull();
    expect(admin.companyId).toBe(company.id);
  });
});
