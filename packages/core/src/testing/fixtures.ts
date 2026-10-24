import { db } from "@repo/database";
import type { CompanyRole } from "@repo/shared";
import type { ActorContext } from "../context";
import { createId } from "../ids";
import {
  AVERAGE_CANDIDATE,
  scriptedAnswer,
  STRONG_CANDIDATE,
  type ScriptedAnswerSet,
} from "../seed/answers";
import {
  authenticateCandidateSession,
  beginCandidateSession,
  startCandidateSession,
  submitCandidateMessage,
  type CandidateSessionView,
} from "../services/candidate-session";
import { createCompany } from "../services/company";
import { startProductTrial } from "../services/subscriptions";
import { createInvitation } from "../services/invitations";
import { createJob } from "../services/jobs";
import { createTemplate, generateTemplateDraft, publishTemplate } from "../services/templates";

export { AVERAGE_CANDIDATE, STRONG_CANDIDATE };

export async function createTestUser(email: string, name = "Test User") {
  return db.user.create({ data: { id: createId("u"), email, name, emailVerified: true } });
}

export async function addMember(
  companyId: string,
  role: CompanyRole,
  email: string,
): Promise<ActorContext> {
  const user = await createTestUser(email, `${role} user`);
  await db.companyMember.create({ data: { companyId, userId: user.id, role } });
  return { userId: user.id, userName: user.name, companyId, role, platformRole: "USER" };
}

/** A company with an admin, the MVP job (§153) and a published 20-minute AI-generated interview. */
export async function createWorkspace(companyName = "Nova Technologies") {
  const slug = companyName.toLowerCase().replace(/\W+/g, "-");
  const owner = await createTestUser(`admin@${slug}.test`, "Workspace Admin");
  const company = await createCompany(
    { id: owner.id, name: owner.name },
    { name: companyName, timezone: "UTC" },
  );
  const admin: ActorContext = {
    userId: owner.id,
    userName: owner.name,
    companyId: company.id,
    role: "COMPANY_ADMIN",
    platformRole: "USER",
  };
  await startProductTrial(admin, "interviewer");
  const job = await createJob(admin, {
    title: "Junior Java Developer",
    employmentType: "FULL_TIME",
    workMode: "HYBRID",
    experienceLevel: "JUNIOR",
    description: "Build Spring Boot services.",
    requirements: "Java, Spring Boot, REST APIs, SQL and Git.",
    status: "ACTIVE",
    skills: [
      { name: "Java", weight: 30, expectedLevel: "INTERMEDIATE", isCritical: true },
      { name: "Spring Boot", weight: 30, expectedLevel: "INTERMEDIATE" },
      { name: "REST API", weight: 15, expectedLevel: "INTERMEDIATE" },
      { name: "SQL", weight: 15, expectedLevel: "BEGINNER" },
      { name: "Git", weight: 10, expectedLevel: "BEGINNER" },
    ],
  });
  const document = await generateTemplateDraft(admin, {
    jobId: job.id,
    durationMinutes: 20,
    interviewType: "TECHNICAL",
  });
  const template = await createTemplate(admin, job.id, document, { generatedByAi: true });
  await publishTemplate(admin, template.id);
  return { company, admin, job, template };
}

export async function inviteCandidate(
  actor: ActorContext,
  templateId: string,
  person = { firstName: "Omar", lastName: "Test", email: "omar@example.com" },
) {
  const result = await createInvitation(actor, {
    templateId,
    candidate: person,
    sendEmail: false,
    expiresInDays: 7,
  });
  const token = result.url.split("/i/")[1];
  if (!token) throw new Error("Invitation URL has no token");
  return { ...result, token };
}

const CONSENTS = { terms: true, privacy: true, aiInterview: true } as const;

/** Candidate consents and the interviewer delivers its welcome message. */
export async function beginInterview(token: string) {
  const begun = await beginCandidateSession(
    token,
    { confirmedName: "Omar Test", consents: CONSENTS },
    {},
  );
  const load = () => authenticateCandidateSession(begun.sessionId, begun.credential);
  const view = await startCandidateSession(await load());
  return { ...begun, load, view };
}

/** Answer every question with a scripted candidate until the interview ends. */
export async function completeInterview(
  token: string,
  answers: ScriptedAnswerSet = STRONG_CANDIDATE,
  maxTurns = 60,
) {
  const started = await beginInterview(token);
  let view: CandidateSessionView = started.view;
  for (let turn = 0; turn < maxTurns && !view.completed; turn += 1) {
    const last = view.messages.at(-1);
    if (!last) throw new Error("No interviewer message to answer");
    const stored = await db.interviewMessage.findUnique({
      where: { id: last.id },
      select: { action: true },
    });
    const content =
      turn === 0
        ? "Yes, I can hear you and I'm ready."
        : scriptedAnswer(answers, last.content, stored?.action === "ASK_FOLLOW_UP");
    const res = await submitCandidateMessage(await started.load(), {
      clientMessageId: createId("m"),
      content,
      source: "TEXT",
    });
    view = res.view;
  }
  return { ...started, view };
}
