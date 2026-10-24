import { LIMITS, POLICY_VERSIONS } from "@repo/config";
import {
  asJson,
  db,
  isUniqueConstraintError,
  type InterviewSession,
  type TransactionClient,
} from "@repo/database";
import {
  assertSessionTransition,
  createInitialMemory,
  EngineUnavailableError,
  isTerminalSession,
  loadMemory,
  orderedSections,
  phrasesFor,
  type EngineMemory,
  type EngineTurnResult,
  type TemplateSnapshot,
} from "@repo/interview-engine";
import { templateSnapshotSchema } from "@repo/interview-engine/snapshot";
import { jobQueue } from "@repo/queue";
import { PROMPT_VERSIONS } from "@repo/ai";
import { SCORING_VERSION } from "@repo/scoring";
import {
  AppError,
  logger,
  secondsBetween,
  type CompletionReason,
  type IntegrityEventType,
  type SessionStatus,
} from "@repo/shared";
import { generateSecureToken, hashToken, safeEqual } from "@repo/shared/server";
import { getStorage, storageKey, validateUpload } from "@repo/storage";
import {
  beginSessionSchema,
  candidateFeedbackSchema,
  candidateMessageSchema,
  integrityEventsSchema,
  parseCompanySettings,
  type BeginSessionInput,
  type CandidateFeedbackInput,
  type CandidateMessageInput,
  type IntegrityEventsInput,
} from "@repo/validation";
import { DEFAULT_VOICE_ID, getSpeechToText, getTextToSpeech, VOICES } from "@repo/voice";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { isFeatureEnabled } from "../feature-flags";
import { createId } from "../ids";
import { getEngine } from "../runtime";
import { assertInterviewQuota, recordSpeechUsage } from "../usage";
import { markInvitationOpened, resolveInvitationToken } from "./invitations";
import { latestParsedResume } from "./resumes";

const ACCEPTING_ANSWERS: SessionStatus[] = [
  "WAITING_FOR_CANDIDATE",
  "AI_SPEAKING",
  "CANDIDATE_SPEAKING",
  "PAUSED",
  "RECONNECTING",
];
const HEARTBEAT_GAP_SECONDS = 45;
const MAX_INTEGRITY_EVENTS = 500;

// ───────────────────────── loading & auth ─────────────────────────

async function loadSession(sessionId: string, client: TransactionClient = db) {
  const session = await client.interviewSession.findUnique({
    where: { id: sessionId },
    include: {
      templateVersion: true,
      candidate: true,
      invitation: true,
      company: {
        select: {
          id: true,
          name: true,
          logoKey: true,
          primaryColor: true,
          settings: true,
          welcomeText: true,
        },
      },
    },
  });
  if (!session || session.deletedAt) throw new AppError("SESSION_INVALID");
  const snapshot = templateSnapshotSchema.parse(session.templateVersion.snapshot);
  return { session, snapshot };
}

type LoadedSession = Awaited<ReturnType<typeof loadSession>>;

/** Verify the candidate's session credential (httpOnly cookie). */
export async function authenticateCandidateSession(
  sessionId: string,
  credential: string | undefined,
): Promise<LoadedSession> {
  if (!credential) throw new AppError("SESSION_INVALID");
  const loaded = await loadSession(sessionId);
  if (!safeEqual(loaded.session.credentialHash, hashToken(credential)))
    throw new AppError("SESSION_INVALID");
  if (loaded.session.invitation.status === "CANCELLED") throw new AppError("INVITATION_INVALID");
  return loaded;
}

function elapsedSeconds(
  session: Pick<InterviewSession, "startedAt" | "pausedSeconds" | "pausedAt">,
  now = new Date(),
): number {
  if (!session.startedAt) return 0;
  const pausedNow = session.pausedAt ? secondsBetween(session.pausedAt, now) : 0;
  return Math.max(0, secondsBetween(session.startedAt, now) - session.pausedSeconds - pausedNow);
}

// ───────────────────────── candidate-safe view ─────────────────────────

export interface CandidateMessageView {
  id: string;
  role: "AI" | "CANDIDATE";
  content: string;
  sequenceNumber: number;
  createdAt: string;
}

export interface CandidateSessionView {
  sessionId: string;
  status: SessionStatus;
  completed: boolean;
  completionReason: CompletionReason | null;
  candidateFirstName: string;
  interviewer: { name: string; voiceId: string; voiceHints: string[]; speed: number };
  company: { name: string; logoUrl: string | null; primaryColor: string | null };
  job: { title: string };
  language: string;
  responseMode: string;
  durationMinutes: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  progress: { questionsAsked: number; sectionIndex: number; sectionCount: number; percent: number };
  speech: { stt: "client" | "server"; tts: "client" | "server" };
  integrityMonitoring: boolean;
  recording: boolean;
  /** Self-view camera preview: allowed by the company and opted into by the candidate. Never recorded. */
  camera: boolean;
  feedback: { enabled: boolean; submitted: boolean };
  messages: CandidateMessageView[];
}

function toMessageView(m: {
  id: string;
  role: string;
  content: string;
  sequenceNumber: number;
  createdAt: Date;
}): CandidateMessageView {
  return {
    id: m.id,
    role: m.role as "AI" | "CANDIDATE",
    content: m.content,
    sequenceNumber: m.sequenceNumber,
    createdAt: m.createdAt.toISOString(),
  };
}

function progressFor(
  snapshot: TemplateSnapshot,
  memory: EngineMemory,
  elapsed: number,
  completed: boolean,
) {
  const sectionCount = orderedSections(snapshot).length;
  const timePercent = (elapsed / (snapshot.durationMinutes * 60)) * 100;
  const sectionPercent = sectionCount > 0 ? (memory.sectionIndex / sectionCount) * 100 : 0;
  return {
    questionsAsked: memory.primaryQuestionsAsked,
    sectionIndex: memory.sectionIndex,
    sectionCount,
    percent: completed ? 100 : Math.round(Math.min(97, Math.max(timePercent, sectionPercent))),
  };
}

/** Everything the interview room needs — and nothing server-only (spec §26, §59). */
export async function getCandidateSessionView(
  loaded: LoadedSession,
): Promise<CandidateSessionView> {
  const { session, snapshot } = loaded;
  const [messages, feedback, cameraConsent] = await Promise.all([
    db.interviewMessage.findMany({
      where: { sessionId: session.id, role: { in: ["AI", "CANDIDATE"] } },
      orderBy: { sequenceNumber: "asc" },
      select: { id: true, role: true, content: true, sequenceNumber: true, createdAt: true },
    }),
    db.candidateFeedback.findUnique({ where: { sessionId: session.id }, select: { id: true } }),
    db.consentRecord.findFirst({
      where: { sessionId: session.id, consentType: "CAMERA" },
      orderBy: { createdAt: "desc" },
      select: { accepted: true },
    }),
  ]);
  const settings = parseCompanySettings(session.company.settings);
  const memory = loadMemory(session.engineState, snapshot);
  const elapsed = elapsedSeconds(session);
  const completed = isTerminalSession(session.status);
  const voice =
    VOICES.find((v) => v.id === snapshot.voice) ?? VOICES.find((v) => v.id === DEFAULT_VOICE_ID)!;
  const feedbackEnabled =
    settings.candidateFeedbackEnabled &&
    (await isFeatureEnabled(session.companyId, "candidateFeedback"));
  return {
    sessionId: session.id,
    status: session.status,
    completed,
    completionReason: session.completionReason,
    candidateFirstName: session.candidate.firstName,
    interviewer: {
      name: snapshot.interviewerName,
      voiceId: voice.id,
      voiceHints: voice.browserHints,
      speed: settings.voiceSpeed,
    },
    company: {
      name: session.company.name,
      logoUrl: session.company.logoKey ? `/api/public/companies/${session.company.id}/logo` : null,
      primaryColor: session.company.primaryColor,
    },
    job: { title: snapshot.job.title },
    language: snapshot.language,
    responseMode: session.responseMode,
    durationMinutes: snapshot.durationMinutes,
    elapsedSeconds: elapsed,
    remainingSeconds: Math.max(0, snapshot.durationMinutes * 60 - elapsed),
    progress: progressFor(snapshot, memory, elapsed, completed),
    speech: { stt: getSpeechToText().mode, tts: getTextToSpeech().mode },
    integrityMonitoring: snapshot.aiSettings.integrityMonitoring && settings.integrityMonitoring,
    recording: session.recordingEnabled,
    camera:
      Boolean(cameraConsent?.accepted) && (await cameraAvailable(session.companyId, settings)),
    feedback: { enabled: feedbackEnabled, submitted: Boolean(feedback) },
    messages: messages.map(toMessageView),
  };
}

// ───────────────────────── begin / start ─────────────────────────

export interface BeginResult {
  sessionId: string;
  credential: string;
  resumed: boolean;
}

/**
 * Pre-interview: confirm identity, record consents and create (or resume) the
 * session. Returns a fresh session credential for the httpOnly cookie.
 */
export async function beginCandidateSession(
  token: string,
  rawInput: BeginSessionInput,
  meta: { ipHash?: string; userAgent?: string },
): Promise<BeginResult> {
  const input = beginSessionSchema.parse(rawInput);
  const { invitation, snapshot, company, latestSession, state } =
    await resolveInvitationToken(token);
  if (state !== "VALID") {
    throw new AppError(
      state === "EXPIRED"
        ? "INVITATION_EXPIRED"
        : state === "CANCELLED"
          ? "INVITATION_INVALID"
          : "INVITATION_EXHAUSTED",
    );
  }
  if (input.confirmedEmail && input.confirmedEmail !== invitation.candidate.email.toLowerCase()) {
    throw new AppError("VALIDATION_FAILED", {
      message:
        "This email doesn't match the invitation. Please use the email address the invitation was sent to.",
    });
  }
  const recordingRequired =
    snapshot.aiSettings.recordingEnabled && parseCompanySettings(company.settings).recordingEnabled;
  if (recordingRequired && !input.consents.recording) {
    throw new AppError("VALIDATION_FAILED", {
      message: "This interview is recorded. Please accept the recording consent to continue.",
    });
  }

  const cameraOffered = await cameraAvailable(company.id, parseCompanySettings(company.settings));
  const credential = generateSecureToken();
  const credentialHash = hashToken(credential);
  const consentRows = (sessionId: string) =>
    [
      { consentType: "TERMS" as const, accepted: true, policyVersion: POLICY_VERSIONS.terms },
      { consentType: "PRIVACY" as const, accepted: true, policyVersion: POLICY_VERSIONS.privacy },
      {
        consentType: "AI_INTERVIEW" as const,
        accepted: true,
        policyVersion: POLICY_VERSIONS.aiInterview,
      },
      ...(recordingRequired
        ? [
            {
              consentType: "RECORDING" as const,
              accepted: input.consents.recording,
              policyVersion: POLICY_VERSIONS.recording,
            },
          ]
        : []),
      ...(cameraOffered
        ? [
            {
              consentType: "CAMERA" as const,
              accepted: input.consents.camera,
              policyVersion: POLICY_VERSIONS.camera,
            },
          ]
        : []),
    ].map((c) => ({
      ...c,
      candidateId: invitation.candidateId,
      invitationId: invitation.id,
      sessionId,
      ipHash: meta.ipHash ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    }));

  // Resume an active session (refresh, another device). The old credential stops working.
  if (latestSession && !isTerminalSession(latestSession.status)) {
    const recentlyActive =
      latestSession.lastHeartbeatAt && secondsBetween(latestSession.lastHeartbeatAt) < 30;
    await db.$transaction(async (tx) => {
      await tx.interviewSession.update({
        where: { id: latestSession.id },
        data: { credentialHash, reconnectCount: { increment: 1 } },
      });
      await tx.consentRecord.createMany({ data: consentRows(latestSession.id) });
      if (recentlyActive) {
        await tx.integrityEvent.create({
          data: {
            sessionId: latestSession.id,
            type: "MULTIPLE_SESSIONS",
            metadata: asJson({ note: "Interview reopened while another window was active" }),
          },
        });
      }
    });
    return { sessionId: latestSession.id, credential, resumed: true };
  }

  await assertInterviewQuota(company.id);
  const sessionId = createId("s");
  await db.$transaction(async (tx) => {
    const fresh = await tx.interviewInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    if (fresh.attemptCount >= fresh.maxAttempts) throw new AppError("INVITATION_EXHAUSTED");
    await tx.interviewSession.create({
      data: {
        id: sessionId,
        companyId: company.id,
        invitationId: invitation.id,
        candidateId: invitation.candidateId,
        applicationId: invitation.applicationId,
        templateVersionId: invitation.templateVersionId,
        attemptNumber: fresh.attemptCount + 1,
        status: "READY",
        credentialHash,
        language: snapshot.language,
        responseMode:
          input.preferredMode && snapshot.responseMode === "VOICE_AND_TEXT"
            ? input.preferredMode
            : snapshot.responseMode,
        recordingEnabled: recordingRequired && input.consents.recording,
        engineState: asJson(createInitialMemory(snapshot)),
        promptVersion: PROMPT_VERSIONS.interviewer,
        scoringVersion: SCORING_VERSION,
      },
    });
    await tx.interviewInvitation.update({
      where: { id: invitation.id },
      data: {
        attemptCount: { increment: 1 },
        status: "STARTED",
        openedAt: fresh.openedAt ?? new Date(),
      },
    });
    await tx.application.update({
      where: { id: invitation.applicationId },
      data: { stage: "STARTED", stageUpdatedAt: new Date() },
    });
    await tx.consentRecord.createMany({ data: consentRows(sessionId) });
  });
  return { sessionId, credential, resumed: false };
}

/** Public landing data for /i/[token] (no session yet). */
export async function getInvitationLanding(token: string) {
  const { invitation, snapshot, company, latestSession, state } =
    await resolveInvitationToken(token);
  if (state === "VALID") await markInvitationOpened(invitation.id, invitation.applicationId);
  const settings = parseCompanySettings(company.settings);
  return {
    state,
    candidate: {
      firstName: invitation.candidate.firstName,
      lastName: invitation.candidate.lastName,
      emailHint: maskEmail(invitation.candidate.email),
    },
    company: {
      id: company.id,
      name: company.name,
      logoUrl: company.logoKey ? `/api/public/companies/${company.id}/logo` : null,
      primaryColor: company.primaryColor,
      welcomeText: company.welcomeText,
    },
    interview: {
      jobTitle: snapshot.job.title,
      durationMinutes: snapshot.durationMinutes,
      interviewerName: snapshot.interviewerName,
      responseMode: snapshot.responseMode,
      language: snapshot.language,
      recording: snapshot.aiSettings.recordingEnabled && settings.recordingEnabled,
      camera: await cameraAvailable(company.id, settings),
      expiresAt: invitation.expiresAt.toISOString(),
      sectionNames: orderedSections(snapshot).map((s) => s.name),
    },
    activeSessionId:
      latestSession && !isTerminalSession(latestSession.status) ? latestSession.id : null,
    latestSessionId: latestSession?.id ?? null,
  };
}

/** The company opted in to the optional camera preview and the platform flag is on. */
async function cameraAvailable(
  companyId: string,
  settings: { cameraEnabled: boolean },
): Promise<boolean> {
  return settings.cameraEnabled && (await isFeatureEnabled(companyId, "camera"));
}

function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/** Start the conversation: the interviewer's welcome message (idempotent). */
export async function startCandidateSession(loaded: LoadedSession): Promise<CandidateSessionView> {
  const { session, snapshot } = loaded;
  if (session.status !== "READY") return getCandidateSessionView(await loadSession(session.id));
  assertSessionTransition("READY", "STARTING");
  const claimed = await db.interviewSession.updateMany({
    where: { id: session.id, status: "READY" },
    data: { status: "STARTING" },
  });
  if (claimed.count === 0) return getCandidateSessionView(await loadSession(session.id));

  const memory = loadMemory(session.engineState, snapshot);
  const result = getEngine().begin({
    snapshot,
    memory,
    candidate: { firstName: session.candidate.firstName, resume: null },
    elapsedSeconds: 0,
  });
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.interviewMessage.create({
      data: {
        sessionId: session.id,
        role: "AI",
        content: result.reply.text,
        sequenceNumber: 1,
        action: result.reply.action,
        metadata: asJson({ kind: "greeting" }),
      },
    });
    await tx.interviewSession.update({
      where: { id: session.id },
      data: {
        status: "WAITING_FOR_CANDIDATE",
        engineState: asJson(result.memory),
        startedAt: now,
        lastActivityAt: now,
        lastHeartbeatAt: now,
        stateVersion: { increment: 1 },
      },
    });
  });
  return getCandidateSessionView(await loadSession(session.id));
}

// ───────────────────────── answering ─────────────────────────

export interface TurnResponse {
  aiMessage: CandidateMessageView;
  candidateMessage: CandidateMessageView;
  view: CandidateSessionView;
  replayed: boolean;
}

async function nextSequence(tx: TransactionClient, sessionId: string): Promise<number> {
  const last = await tx.interviewMessage.findFirst({
    where: { sessionId },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });
  return (last?.sequenceNumber ?? 0) + 1;
}

/**
 * Process one candidate answer (spec §103). Idempotent per clientMessageId:
 * a retried request returns the original reply instead of creating duplicates.
 */
export async function submitCandidateMessage(
  loaded: LoadedSession,
  rawInput: CandidateMessageInput & { recordingId?: string },
): Promise<TurnResponse> {
  const input = candidateMessageSchema.parse(rawInput);
  const { session: initial, snapshot } = loaded;

  // 1. Idempotency: same clientMessageId already answered → replay.
  const existing = await db.interviewMessage.findUnique({
    where: {
      sessionId_clientMessageId: { sessionId: initial.id, clientMessageId: input.clientMessageId },
    },
  });
  if (existing) {
    const reply = await db.interviewMessage.findFirst({
      where: { sessionId: initial.id, role: "AI", sequenceNumber: { gt: existing.sequenceNumber } },
      orderBy: { sequenceNumber: "asc" },
    });
    if (reply) {
      return {
        aiMessage: toMessageView(reply),
        candidateMessage: toMessageView(existing),
        view: await getCandidateSessionView(await loadSession(initial.id)),
        replayed: true,
      };
    }
  }

  if (isTerminalSession(initial.status))
    throw new AppError("SESSION_STATE_CONFLICT", { message: "This interview has already ended." });
  if (!initial.startedAt)
    throw new AppError("SESSION_STATE_CONFLICT", { message: "The interview hasn't started yet." });

  // 2. Acquire the turn lock (optimistic concurrency on stateVersion).
  const staleBefore = new Date(Date.now() - LIMITS.interview.staleTurnLockSeconds * 1000);
  const lock = await db.interviewSession.updateMany({
    where: {
      id: initial.id,
      stateVersion: initial.stateVersion,
      OR: [
        { status: { in: ACCEPTING_ANSWERS } },
        { status: "PROCESSING_ANSWER", turnLockedAt: { lt: staleBefore } },
      ],
    },
    data: { status: "PROCESSING_ANSWER", turnLockedAt: new Date(), stateVersion: { increment: 1 } },
  });
  if (lock.count === 0) throw new AppError("SESSION_BUSY");
  const pausedAtLock = initial.pausedAt;

  try {
    // 3. Persist the candidate's message first so it is never lost.
    let candidateMessage = existing;
    if (!candidateMessage) {
      candidateMessage = await db.$transaction(async (tx) =>
        tx.interviewMessage.create({
          data: {
            sessionId: initial.id,
            role: "CANDIDATE",
            content: input.content.trim(),
            sequenceNumber: await nextSequence(tx, initial.id),
            clientMessageId: input.clientMessageId,
            metadata: asJson({
              source: input.source,
              latencyMs: input.latencyMs ?? null,
              transcriptConfidence: input.transcriptConfidence ?? null,
            }),
          },
        }),
      );
    }
    if (rawInput.recordingId) {
      await db.recording.updateMany({
        where: { id: rawInput.recordingId, sessionId: initial.id, messageId: null },
        data: { messageId: candidateMessage.id },
      });
    }

    // 4. Run the engine.
    const now = new Date();
    const resumeFromPause = pausedAtLock ? secondsBetween(pausedAtLock, now) : 0;
    const sessionForTiming = {
      ...initial,
      pausedAt: null,
      pausedSeconds: initial.pausedSeconds + resumeFromPause,
    };
    const memory = loadMemory(initial.engineState, snapshot);
    const resume = snapshot.aiSettings.resumeQuestions
      ? await latestParsedResume(initial.candidateId)
      : null;
    const answerId = createId("a");
    let result: EngineTurnResult;
    try {
      result = await getEngine().respond(
        {
          snapshot,
          memory,
          candidate: { firstName: initial.candidate.firstName, resume },
          elapsedSeconds: elapsedSeconds(sessionForTiming, now),
          meta: { companyId: initial.companyId, sessionId: initial.id },
        },
        {
          answerId,
          text: input.content,
          source: input.source,
          transcriptConfidence: input.transcriptConfidence,
        },
      );
    } catch (error) {
      if (error instanceof EngineUnavailableError) {
        // Pause gracefully; the candidate can retry the same answer (spec §120).
        await db.interviewSession.update({
          where: { id: initial.id },
          data: {
            status: "PAUSED",
            pausedAt: new Date(),
            turnLockedAt: null,
            pausedSeconds: sessionForTiming.pausedSeconds,
          },
        });
        throw new AppError("AI_UNAVAILABLE", {
          message:
            "We're having trouble generating the next question. Your answer is saved — please try again in a moment.",
        });
      }
      throw error;
    }

    // 5. Persist the turn atomically.
    const aiMessage = await db.$transaction(async (tx) => {
      if (result.answered) {
        await tx.candidateAnswer.create({
          data: {
            id: answerId,
            sessionId: initial.id,
            messageId: candidateMessage.id,
            questionKey: result.answered.questionKey,
            questionText: result.answered.questionText,
            questionType: result.answered.questionType,
            sectionKey: result.answered.sectionKey,
            skillKey: result.answered.skillKey,
            difficulty: result.answered.difficulty,
            isFollowUp: result.answered.isFollowUp,
            followUpDepth: result.answered.followUpDepth,
            threadKey: result.answered.threadKey,
            source: input.source,
            responseLatencyMs: input.latencyMs ?? null,
          },
        });
        if (result.evaluation) {
          await tx.questionEvaluation.create({
            data: {
              sessionId: initial.id,
              answerId,
              phase: "INTERIM",
              threadKey: result.answered.threadKey,
              questionKey: result.answered.questionKey,
              questionText: result.answered.questionText,
              skillKey: result.answered.skillKey,
              difficulty: result.answered.difficulty,
              score: result.evaluation.score,
              confidence: result.evaluation.confidence,
              answerSummary: result.evaluation.answerSummary,
              demonstratedConcepts: result.evaluation.demonstratedConcepts,
              missingConcepts: result.evaluation.missingConcepts,
              incorrectClaims: result.evaluation.incorrectClaims,
              needsFollowUp: result.evaluation.needsFollowUp,
              star: result.evaluation.star ? asJson(result.evaluation.star) : undefined,
              promptVersion: result.diagnostics.promptVersion,
            },
          });
        }
      }
      const created = await tx.interviewMessage.create({
        data: {
          sessionId: initial.id,
          role: "AI",
          content: result.reply.text,
          sequenceNumber: await nextSequence(tx, initial.id),
          action: result.reply.action,
          questionKey: result.reply.questionKey,
          sectionKey: result.reply.sectionKey,
          metadata: asJson({
            intent: result.intent,
            threadKey: result.reply.threadKey,
            isFollowUp: result.reply.isFollowUp,
            skillKey: result.reply.skillKey,
            difficulty: result.reply.difficulty,
            questionType: result.reply.questionType,
            reasonInternal: result.diagnostics.reasonInternal,
            usedFallback: result.diagnostics.usedFallback,
            deterministic: result.diagnostics.deterministic,
            provider: result.diagnostics.provider,
            model: result.diagnostics.model,
            latencyMs: result.diagnostics.latencyMs,
            guardRejected: result.diagnostics.guardRejected ?? null,
          }),
        },
      });
      await tx.interviewSession.update({
        where: { id: initial.id },
        data: {
          status: result.completion ? "FINISHING" : "WAITING_FOR_CANDIDATE",
          engineState: asJson(result.memory),
          currentSectionKey: result.memory.current?.sectionKey ?? null,
          currentQuestionKey: result.memory.current?.questionKey ?? null,
          questionsAsked: result.memory.primaryQuestionsAsked,
          followUpsAsked: result.memory.followUpsAsked,
          lastActivityAt: now,
          turnLockedAt: null,
          pausedAt: null,
          pausedSeconds: sessionForTiming.pausedSeconds,
          stateVersion: { increment: 1 },
        },
      });
      if (result.completion) await completeSessionTx(tx, initial.id, result.completion);
      return created;
    });

    if (input.latencyMs && input.latencyMs > 3 * 60_000) {
      await recordIntegrity(initial.id, snapshot, initial.company.settings, [
        {
          type: "LONG_RESPONSE_LATENCY",
          occurredAt: new Date(),
          metadata: { seconds: Math.round(input.latencyMs / 1000) },
        },
      ]);
    }

    return {
      aiMessage: toMessageView(aiMessage),
      candidateMessage: toMessageView(candidateMessage),
      view: await getCandidateSessionView(await loadSession(initial.id)),
      replayed: false,
    };
  } catch (error) {
    // Release the lock on unexpected errors so the candidate can retry.
    await db.interviewSession.updateMany({
      where: { id: initial.id, status: "PROCESSING_ANSWER" },
      data: { status: "WAITING_FOR_CANDIDATE", turnLockedAt: null },
    });
    throw error;
  }
}

// ───────────────────────── completion ─────────────────────────

/** Complete a session and queue its evaluation, atomically (spec §86). */
export async function completeSessionTx(
  tx: TransactionClient,
  sessionId: string,
  reason: CompletionReason,
): Promise<void> {
  const session = await tx.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (session.status === "COMPLETED") return;
  if (session.status !== "FINISHING") assertSessionTransition(session.status, "FINISHING");
  const now = new Date();
  const answers = await tx.candidateAnswer.count({ where: { sessionId } });
  await tx.interviewSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      endedAt: now,
      completionReason: reason,
      turnLockedAt: null,
      pausedAt: null,
    },
  });
  await tx.interviewInvitation.update({
    where: { id: session.invitationId },
    data: { status: "COMPLETED" },
  });
  await tx.application.updateMany({
    where: {
      id: session.applicationId,
      stage: { in: ["INVITED", "OPENED", "STARTED", "EXPIRED"] },
    },
    data: { stage: "COMPLETED", stageUpdatedAt: now },
  });
  await tx.interviewEvaluation.upsert({
    where: { sessionId },
    update: {},
    create: {
      sessionId,
      status: "PENDING",
      promptVersion: PROMPT_VERSIONS.evaluation,
      scoringVersion: SCORING_VERSION,
    },
  });
  if (answers > 0) {
    await jobQueue.enqueue(
      "interview.evaluate",
      { sessionId },
      { tx, uniqueKey: `evaluate:${sessionId}`, maxAttempts: 4 },
    );
  } else {
    await tx.interviewEvaluation.update({
      where: { sessionId },
      data: {
        status: "COMPLETED",
        recommendation: "INSUFFICIENT_EVIDENCE",
        recommendationConfidence: 0.1,
        confidenceLevel: "LOW",
        summary: "The candidate did not answer any questions, so there is no evidence to evaluate.",
        generatedAt: now,
      },
    });
  }
  await jobQueue.enqueue(
    "interview.post-completion",
    { sessionId },
    { tx, uniqueKey: `post-completion:${sessionId}` },
  );
}

/** Candidate chooses to end the interview early (spec §108). */
export async function endInterviewByCandidate(
  loaded: LoadedSession,
): Promise<CandidateSessionView> {
  const { session, snapshot } = loaded;
  if (isTerminalSession(session.status)) return getCandidateSessionView(loaded);
  const phrases = phrasesFor(snapshot.language);
  await db.$transaction(async (tx) => {
    const locked = await tx.interviewSession.updateMany({
      where: { id: session.id, status: { notIn: ["COMPLETED", "FAILED", "EXPIRED", "FINISHING"] } },
      data: { status: "FINISHING", stateVersion: { increment: 1 } },
    });
    if (locked.count === 0) return;
    await tx.interviewMessage.create({
      data: {
        sessionId: session.id,
        role: "AI",
        content: phrases.closing({
          firstName: session.candidate.firstName,
          jobTitle: snapshot.job.title,
        }),
        sequenceNumber: await nextSequence(tx, session.id),
        action: "END_INTERVIEW",
        metadata: asJson({ kind: "candidate_ended" }),
      },
    });
    await completeSessionTx(tx, session.id, "CANDIDATE_ENDED");
  });
  return getCandidateSessionView(await loadSession(session.id));
}

/** Recruiter/admin terminates a live interview (audited). */
export async function terminateSession(
  ctx: ActorContext,
  sessionId: string,
  reason: string,
): Promise<void> {
  requirePermission(ctx, "session.terminate");
  const session = await db.interviewSession.findFirst({
    where: { id: sessionId, companyId: ctx.companyId },
  });
  if (!session) throw new AppError("NOT_FOUND", { message: "Interview not found." });
  if (isTerminalSession(session.status)) return;
  await db.$transaction(async (tx) => {
    await tx.interviewSession.update({
      where: { id: sessionId },
      data: { status: "FINISHING", failureReason: reason.slice(0, 500) },
    });
    await completeSessionTx(tx, sessionId, "ADMIN_TERMINATED");
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.sessionTerminated,
        entityType: "interview_session",
        entityId: sessionId,
        metadata: { reason },
      },
      tx,
    );
  });
}

// ───────────────────────── heartbeat, integrity, feedback ─────────────────────────

export async function heartbeat(
  loaded: LoadedSession,
  input: { reconnected?: boolean },
): Promise<CandidateSessionView> {
  const { session, snapshot } = loaded;
  if (isTerminalSession(session.status)) return getCandidateSessionView(loaded);
  const now = new Date();
  const gap = session.lastHeartbeatAt ? secondsBetween(session.lastHeartbeatAt, now) : 0;
  const disconnected = session.startedAt && gap > HEARTBEAT_GAP_SECONDS;
  const events: Array<{
    type: IntegrityEventType;
    occurredAt: Date;
    metadata: Record<string, string | number | boolean>;
  }> = [];
  if (disconnected) {
    events.push({
      type: "CONNECTION_LOST",
      occurredAt: session.lastHeartbeatAt!,
      metadata: { seconds: gap },
    });
    events.push({ type: "CONNECTION_RESTORED", occurredAt: now, metadata: { seconds: gap } });
  }
  const reconnectCount = session.reconnectCount + (input.reconnected || disconnected ? 1 : 0);
  if ((input.reconnected || disconnected) && reconnectCount === 5) {
    events.push({ type: "RAPID_RECONNECTS", occurredAt: now, metadata: { count: reconnectCount } });
  }
  await db.interviewSession.update({
    where: { id: session.id },
    data: {
      lastHeartbeatAt: now,
      reconnectCount,
      // Time spent disconnected doesn't count against the candidate.
      ...(disconnected
        ? {
            pausedSeconds: {
              increment: Math.max(0, gap - LIMITS.interview.heartbeatIntervalSeconds),
            },
          }
        : {}),
    },
  });
  if (events.length > 0)
    await recordIntegrity(session.id, snapshot, session.company.settings, events);

  // Strict time limit: close the interview server-side even if the candidate stays silent.
  const refreshed = await loadSession(session.id);
  const elapsed = elapsedSeconds(refreshed.session, now);
  const hardLimit =
    snapshot.durationMinutes * 60 +
    (snapshot.aiSettings.strictTimeLimit ? 0 : LIMITS.interview.overtimeGraceSeconds);
  if (
    refreshed.session.startedAt &&
    elapsed > hardLimit &&
    ACCEPTING_ANSWERS.includes(refreshed.session.status)
  ) {
    await db.$transaction(async (tx) => {
      const locked = await tx.interviewSession.updateMany({
        where: { id: session.id, status: { in: ACCEPTING_ANSWERS } },
        data: { status: "FINISHING" },
      });
      if (locked.count === 0) return;
      const phrases = phrasesFor(snapshot.language);
      await tx.interviewMessage.create({
        data: {
          sessionId: session.id,
          role: "AI",
          content: `${phrases.timeUp} ${phrases.closing({ firstName: refreshed.session.candidate.firstName, jobTitle: snapshot.job.title })}`,
          sequenceNumber: await nextSequence(tx, session.id),
          action: "END_INTERVIEW",
          metadata: asJson({ kind: "time_limit" }),
        },
      });
      await completeSessionTx(tx, session.id, "TIME_LIMIT");
    });
    return getCandidateSessionView(await loadSession(session.id));
  }
  return getCandidateSessionView(refreshed);
}

async function recordIntegrity(
  sessionId: string,
  snapshot: TemplateSnapshot,
  companySettings: unknown,
  events: Array<{
    type: IntegrityEventType;
    occurredAt: Date;
    metadata: Record<string, string | number | boolean>;
  }>,
): Promise<void> {
  const settings = parseCompanySettings(companySettings);
  if (!snapshot.aiSettings.integrityMonitoring || !settings.integrityMonitoring) return;
  const count = await db.integrityEvent.count({ where: { sessionId } });
  if (count >= MAX_INTEGRITY_EVENTS) return;
  await db.integrityEvent.createMany({
    data: events.slice(0, MAX_INTEGRITY_EVENTS - count).map((e) => ({
      sessionId,
      type: e.type,
      occurredAt: e.occurredAt,
      metadata: asJson(e.metadata),
    })),
  });
}

/** Objective integrity signals from the browser (spec §54). Never used for scoring. */
export async function recordIntegrityEvents(
  loaded: LoadedSession,
  rawInput: IntegrityEventsInput,
): Promise<void> {
  const input = integrityEventsSchema.parse(rawInput);
  if (isTerminalSession(loaded.session.status)) return;
  if (!(await isFeatureEnabled(loaded.session.companyId, "integrityMonitoring"))) return;
  await recordIntegrity(
    loaded.session.id,
    loaded.snapshot,
    loaded.session.company.settings,
    input.events,
  );
}

export async function submitCandidateFeedback(
  loaded: LoadedSession,
  rawInput: CandidateFeedbackInput,
): Promise<void> {
  const input = candidateFeedbackSchema.parse(rawInput);
  if (!isTerminalSession(loaded.session.status))
    throw new AppError("SESSION_STATE_CONFLICT", {
      message: "Feedback can be shared after the interview.",
    });
  try {
    await db.candidateFeedback.create({
      data: { sessionId: loaded.session.id, rating: input.rating, comment: input.comment },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }
}

// ───────────────────────── speech ─────────────────────────

export async function transcribeCandidateAudio(
  loaded: LoadedSession,
  bytes: Uint8Array,
  options: { transcribe: boolean },
): Promise<{ text: string | null; confidence: number | null; recordingId: string | null }> {
  const { session } = loaded;
  if (isTerminalSession(session.status))
    throw new AppError("SESSION_STATE_CONFLICT", { message: "This interview has already ended." });
  const check = validateUpload(bytes, {
    maxBytes: LIMITS.audio.maxBytes,
    allowedTypes: LIMITS.audio.allowedMimeTypes,
  });
  if (!check.ok) throw new AppError(check.code, { message: check.message });

  let recordingId: string | null = null;
  if (session.recordingEnabled) {
    const key = storageKey(
      `companies/${session.companyId}/recordings/${session.id}`,
      check.extension,
    );
    await getStorage().put({ key, body: bytes, contentType: check.type });
    const recording = await db.recording.create({
      data: {
        sessionId: session.id,
        kind: "CANDIDATE_AUDIO",
        storageKey: key,
        mimeType: check.type,
        sizeBytes: bytes.byteLength,
        offsetMs: session.startedAt ? Date.now() - session.startedAt.getTime() : null,
      },
    });
    recordingId = recording.id;
  }

  if (!options.transcribe) return { text: null, confidence: null, recordingId };
  const stt = getSpeechToText();
  if (stt.mode !== "server")
    throw new AppError("BAD_REQUEST", {
      message: "Speech recognition runs in the browser for this interview.",
    });
  const started = Date.now();
  try {
    const transcript = await stt.transcribe({
      bytes,
      mimeType: check.type,
      language: session.language,
    });
    await recordSpeechUsage({
      kind: "SPEECH_TO_TEXT",
      provider: stt.name,
      model: stt.name,
      companyId: session.companyId,
      sessionId: session.id,
      latencyMs: Date.now() - started,
      audioSeconds: transcript.durationSeconds ?? bytes.byteLength / 16_000,
      success: true,
    });
    return { text: transcript.text, confidence: transcript.confidence, recordingId };
  } catch (error) {
    logger.warn("speech.stt_failed", { sessionId: session.id, error });
    await recordSpeechUsage({
      kind: "SPEECH_TO_TEXT",
      provider: stt.name,
      model: stt.name,
      companyId: session.companyId,
      sessionId: session.id,
      latencyMs: Date.now() - started,
      success: false,
      errorCode: "STT_FAILED",
    });
    throw new AppError("SPEECH_UNAVAILABLE", { cause: error });
  }
}

export async function synthesizeAiMessage(
  loaded: LoadedSession,
  messageId: string,
  voiceOverride?: string,
) {
  const { session, snapshot } = loaded;
  const message = await db.interviewMessage.findFirst({
    where: { id: messageId, sessionId: session.id, role: "AI" },
  });
  if (!message) throw new AppError("NOT_FOUND", { message: "Message not found." });
  const tts = getTextToSpeech();
  if (tts.mode !== "server")
    throw new AppError("BAD_REQUEST", {
      message: "Speech is generated in the browser for this interview.",
    });
  const settings = parseCompanySettings(session.company.settings);
  const started = Date.now();
  try {
    const audio = await tts.synthesize(message.content, {
      voice: voiceOverride ?? snapshot.voice ?? DEFAULT_VOICE_ID,
      language: snapshot.language,
      speed: settings.voiceSpeed,
    });
    await recordSpeechUsage({
      kind: "TEXT_TO_SPEECH",
      provider: tts.name,
      model: tts.name,
      companyId: session.companyId,
      sessionId: session.id,
      latencyMs: Date.now() - started,
      characters: message.content.length,
      success: true,
    });
    return audio;
  } catch (error) {
    logger.warn("speech.tts_failed", { sessionId: session.id, error });
    throw new AppError("SPEECH_UNAVAILABLE", { cause: error });
  }
}

// ───────────────────────── maintenance ─────────────────────────

/** Close sessions abandoned mid-interview so they can be evaluated or expired. */
export async function expireAbandonedSessions(): Promise<number> {
  const candidates = await db.interviewSession.findMany({
    where: {
      status: {
        in: [
          "READY",
          "STARTING",
          "WAITING_FOR_CANDIDATE",
          "AI_SPEAKING",
          "CANDIDATE_SPEAKING",
          "PROCESSING_ANSWER",
          "GENERATING_RESPONSE",
          "PAUSED",
          "RECONNECTING",
        ],
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      startedAt: true,
      lastActivityAt: true,
      templateVersion: { select: { snapshot: true } },
    },
    take: 200,
  });
  let closed = 0;
  for (const s of candidates) {
    const snapshot = templateSnapshotSchema.safeParse(s.templateVersion.snapshot);
    const durationSeconds = snapshot.success ? snapshot.data.durationMinutes * 60 : 3_600;
    const last = s.lastActivityAt ?? s.startedAt ?? s.createdAt;
    if (secondsBetween(last) < durationSeconds + 3_600) continue;
    await db.$transaction(async (tx) => {
      const answers = await tx.candidateAnswer.count({ where: { sessionId: s.id } });
      if (answers === 0 && (s.status === "READY" || s.status === "STARTING")) {
        await tx.interviewSession.update({
          where: { id: s.id },
          data: { status: "EXPIRED", endedAt: new Date(), completionReason: "EXPIRED" },
        });
        return;
      }
      await tx.interviewSession.update({ where: { id: s.id }, data: { status: "FINISHING" } });
      await completeSessionTx(tx, s.id, "TECHNICAL_FAILURE");
    });
    closed += 1;
  }
  return closed;
}

export type { LoadedSession };
