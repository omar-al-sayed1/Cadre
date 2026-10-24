import type {
  AnswerSource,
  CompletionReason,
  InterviewAction,
  QuestionDifficulty,
  QuestionType,
} from "@repo/shared";
import { logger } from "@repo/shared";
import {
  classifyIntent,
  detectPromptInjection,
  type AiCallMeta,
  type AnswerEvaluation,
  type CandidateIntent,
  type CurrentQuestionContext,
  type InterviewAI,
  type InterviewTurnOutput,
  type NextStep,
  type ParsedResume,
  type TurnDirective,
  type TurnInput,
} from "@repo/ai";
import { isAdaptive, nextDifficulty } from "./difficulty";
import { guardSpokenText } from "./guard";
import { phrasesFor } from "./i18n";
import {
  addDigest,
  appendTurn,
  cloneMemory,
  mergeFacts,
  recordSkillEvidence,
  summaryLines,
  type CurrentQuestion,
  type EngineMemory,
} from "./memory";
import { plan as computePlan, type Plan, type PlannedNext } from "./planner";
import { sectionQuestions, type TemplateSnapshot } from "./snapshot";

/**
 * InterviewEngine (spec §22). Pure orchestration over plain data:
 *   memory + snapshot + candidate input  →  reply + new memory + interim evaluation.
 * It never touches the database or HTTP; the session service persists results.
 */

export interface EngineContext {
  snapshot: TemplateSnapshot;
  memory: EngineMemory;
  candidate: { firstName: string; resume: ParsedResume | null };
  elapsedSeconds: number;
  meta?: AiCallMeta;
}

export interface CandidateTurn {
  /** Pre-generated id of the CandidateAnswer row, so evidence can reference it. */
  answerId: string;
  text: string;
  source: AnswerSource;
  transcriptConfidence?: number;
}

export interface EngineReply {
  text: string;
  action: InterviewAction;
  threadKey: string | null;
  questionKey: string | null;
  sectionKey: string | null;
  isFollowUp: boolean;
  questionType: QuestionType | null;
  skillKey: string | null;
  difficulty: QuestionDifficulty | null;
}

export interface AnsweredQuestion {
  threadKey: string;
  questionKey: string | null;
  questionText: string;
  questionType: QuestionType;
  sectionKey: string | null;
  skillKey: string | null;
  difficulty: QuestionDifficulty;
  isFollowUp: boolean;
  followUpDepth: number;
  askedAtSeconds: number;
}

export interface EngineTurnResult {
  memory: EngineMemory;
  reply: EngineReply;
  /** The question the candidate's message answered, when it counts as an answer. */
  answered: AnsweredQuestion | null;
  evaluation: AnswerEvaluation | null;
  intent: CandidateIntent | "GREETING";
  completion: CompletionReason | null;
  diagnostics: {
    usedFallback: boolean;
    deterministic: boolean;
    reasonInternal: string;
    provider: string;
    model: string;
    promptVersion: string;
    latencyMs: number;
    directive: TurnDirective | null;
    aiError?: string;
    guardRejected?: string;
  };
}

export class EngineUnavailableError extends Error {
  constructor(message = "The interviewer is temporarily unavailable") {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

export class EngineStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineStateError";
  }
}

const ANSWER_INTENTS: CandidateIntent[] = ["ANSWER", "PARTIAL_ANSWER", "DONT_KNOW"];
const MAX_CONSECUTIVE_AI_FAILURES = 3;

let threadCounter = 0;
function newThreadKey(): string {
  threadCounter = (threadCounter + 1) % 1_000_000;
  return `t${Date.now().toString(36)}${threadCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function wordCount(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

function resumeHighlights(resume: ParsedResume | null): string[] {
  if (!resume) return [];
  const lines: string[] = [];
  if (resume.headline) lines.push(resume.headline);
  if (resume.totalYearsExperience !== null)
    lines.push(`${resume.totalYearsExperience} years of professional experience (resume claim)`);
  if (resume.skills.length > 0)
    lines.push(`Listed skills: ${resume.skills.slice(0, 15).join(", ")}`);
  for (const role of resume.experience.slice(0, 3)) {
    lines.push(
      `Role: ${role.title}${role.company ? ` at ${role.company}` : ""}${role.technologies.length ? ` (${role.technologies.slice(0, 6).join(", ")})` : ""}`,
    );
  }
  for (const project of resume.projects.slice(0, 3)) {
    lines.push(
      `Project: ${project.name}${project.description ? ` — ${project.description.slice(0, 160)}` : ""}`,
    );
  }
  return lines;
}

export class InterviewEngine {
  constructor(private readonly ai: InterviewAI) {}

  plan(ctx: EngineContext): Plan {
    return computePlan({
      snapshot: ctx.snapshot,
      memory: ctx.memory,
      elapsedSeconds: ctx.elapsedSeconds,
      resume: ctx.snapshot.aiSettings.resumeQuestions ? ctx.candidate.resume : null,
    });
  }

  /** Deterministic welcome message (spec §141). */
  begin(ctx: EngineContext): EngineTurnResult {
    if (ctx.memory.phase !== "NOT_STARTED") throw new EngineStateError("Interview already started");
    const memory = cloneMemory(ctx.memory);
    const phrases = phrasesFor(ctx.snapshot.language);
    const text = phrases.greeting({
      firstName: ctx.candidate.firstName,
      jobTitle: ctx.snapshot.job.title,
      companyName: ctx.snapshot.job.companyName,
      interviewerName: ctx.snapshot.interviewerName,
      minutes: ctx.snapshot.durationMinutes,
      personality: ctx.snapshot.personality,
    });
    memory.phase = "GREETING";
    appendTurn(memory, "AI", text);
    return {
      memory,
      reply: emptyReply(text, "ACKNOWLEDGE"),
      answered: null,
      evaluation: null,
      intent: "GREETING",
      completion: null,
      diagnostics: deterministicDiagnostics("Greeting"),
    };
  }

  /** Process one candidate message and produce the interviewer's next utterance. */
  async respond(ctx: EngineContext, turn: CandidateTurn): Promise<EngineTurnResult> {
    if (ctx.memory.phase === "ENDED") throw new EngineStateError("Interview already ended");
    if (ctx.memory.phase === "NOT_STARTED") throw new EngineStateError("Interview has not started");

    const memory = cloneMemory(ctx.memory);
    const plan = this.plan({ ...ctx, memory });
    const phrases = phrasesFor(ctx.snapshot.language);
    const text = turn.text.trim();
    const current = memory.current;

    // ── Deterministic short-circuits (no model call) ──
    const lowConfidenceVoice =
      turn.source === "VOICE" && (turn.transcriptConfidence ?? 1) < 0.3 && wordCount(text) < 4;
    if (text === "" || lowConfidenceVoice) {
      return this.finishDeterministic(
        ctx,
        memory,
        plan,
        turn,
        "UNCLEAR",
        "CLARIFY",
        phrases.unclear,
        "Empty or unreliable transcript",
      );
    }
    if (detectPromptInjection(text) && wordCount(text) < 40) {
      memory.stats.injectionAttempts += 1;
      const repeat = current ? ` ${current.text}` : "";
      return this.finishDeterministic(
        ctx,
        memory,
        plan,
        turn,
        "PROMPT_INJECTION",
        "CLARIFY",
        `${phrases.injectionDecline}${repeat}`,
        "Declined prompt-injection attempt",
      );
    }
    if (plan.hardStop) {
      return this.finishDeterministic(
        ctx,
        memory,
        plan,
        turn,
        "ANSWER",
        "END_INTERVIEW",
        `${phrases.timeUp} ${phrases.closing({ firstName: ctx.candidate.firstName, jobTitle: ctx.snapshot.job.title })}`,
        "Time limit reached",
        "TIME_LIMIT",
      );
    }

    // ── Model turn ──
    const directive = toDirective(ctx.snapshot, plan);
    const turnInput = this.buildTurnInput(ctx, memory, plan, directive, text);
    const started = Date.now();
    let output: InterviewTurnOutput | null = null;
    let provider = this.ai.providerName;
    let model = this.ai.modelName;
    let promptVersion = "n/a";
    let aiError: string | undefined;
    try {
      const result = await this.ai.getNextInterviewAction(turnInput, ctx.meta);
      output = result.data;
      provider = result.provider;
      model = result.model;
      promptVersion = result.promptVersion;
      memory.consecutiveAiFailures = 0;
    } catch (error) {
      memory.consecutiveAiFailures += 1;
      aiError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      logger.warn("engine.ai_turn_failed", {
        sessionId: ctx.meta?.sessionId,
        failures: memory.consecutiveAiFailures,
        error: aiError,
      });
      if (memory.consecutiveAiFailures >= MAX_CONSECUTIVE_AI_FAILURES) {
        throw new EngineUnavailableError();
      }
    }

    const usedFallback = output === null;
    if (!output) output = this.fallbackOutput(ctx, memory, plan, text);
    if (usedFallback) memory.stats.fallbackResponses += 1;

    const action = validateAction(output, plan);
    let spoken = output.spokenText;
    let guardRejected: string | undefined;
    if (action !== output.action) {
      spoken = this.deterministicText(ctx, memory, plan, action, output.candidateIntent);
    }
    const idealAnswers = ctx.snapshot.questions
      .map((q) => q.idealAnswer)
      .filter((a): a is string => Boolean(a));
    const guarded = guardSpokenText(spoken, { idealAnswers });
    if (!guarded.ok) {
      guardRejected = guarded.reason;
      logger.warn("engine.spoken_text_rejected", {
        sessionId: ctx.meta?.sessionId,
        reason: guarded.reason,
      });
      spoken = this.deterministicText(ctx, memory, plan, action, output.candidateIntent);
    } else {
      spoken = guarded.text;
    }

    const result = this.apply(ctx, memory, plan, turn, {
      intent: output.candidateIntent,
      evaluation: output.answerEvaluation,
      action,
      spoken,
      question: output.question,
    });
    result.diagnostics = {
      usedFallback,
      deterministic: false,
      reasonInternal: output.reasonInternal,
      provider,
      model,
      promptVersion,
      latencyMs: Date.now() - started,
      directive,
      aiError,
      guardRejected,
    };
    return result;
  }

  // ───────────────────────── internals ─────────────────────────

  private finishDeterministic(
    ctx: EngineContext,
    memory: EngineMemory,
    plan: Plan,
    turn: CandidateTurn,
    intent: CandidateIntent,
    action: InterviewAction,
    spoken: string,
    reason: string,
    completion?: CompletionReason,
  ): EngineTurnResult {
    const result = this.apply(
      ctx,
      memory,
      plan,
      turn,
      { intent, evaluation: null, action, spoken, question: null },
      completion,
    );
    result.diagnostics = deterministicDiagnostics(reason);
    return result;
  }

  private buildTurnInput(
    ctx: EngineContext,
    memory: EngineMemory,
    plan: Plan,
    directive: TurnDirective,
    text: string,
  ): TurnInput {
    const { snapshot } = ctx;
    const skillName = (key: string | null) =>
      key ? (snapshot.skills.find((s) => s.key === key)?.name ?? null) : null;
    const current = memory.current;
    const currentQuestion: CurrentQuestionContext | null = current
      ? {
          text: current.text,
          type: current.type,
          skillName: skillName(current.skillKey),
          difficulty: current.difficulty,
          expectedTopics: current.expectedTopics,
          redFlags: current.redFlags,
          followUpGuidance: current.followUpGuidance,
          isFollowUp: current.isFollowUp,
          followUpDepth: current.followUpDepth,
          isBehavioral: current.type === "BEHAVIORAL" || current.type === "SITUATIONAL",
        }
      : null;

    return {
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
      candidateFirstName: ctx.candidate.firstName,
      resumeHighlights: snapshot.aiSettings.resumeQuestions
        ? resumeHighlights(ctx.candidate.resume)
        : [],
      memory: {
        summary: summaryLines(memory),
        candidateFacts: memory.candidateFacts,
        coverage: snapshot.skills.map((s) => {
          const ev = memory.skills[s.key];
          return {
            skill: s.name,
            weight: s.weight,
            coverage: ev?.coverage ?? 0,
            confidence: ev?.confidence ?? 0,
            lastScore: ev?.lastScore ?? null,
            targetDifficulty: ev?.targetDifficulty ?? "MEDIUM",
          };
        }),
        askedQuestions: memory.askedQuestionTexts.slice(-25),
      },
      recentTranscript: memory.recentTurns.map((t) => ({ role: t.role, text: t.text })),
      currentQuestion,
      candidateMessage: text,
      directive,
      timing: {
        elapsedSeconds: plan.timing.elapsedSeconds,
        remainingSeconds: Math.max(0, plan.timing.remainingSeconds),
        phase: plan.timing.phase,
      },
    };
  }

  /** Deterministic replacement when the model is unavailable (spec §120). */
  private fallbackOutput(
    ctx: EngineContext,
    memory: EngineMemory,
    plan: Plan,
    text: string,
  ): InterviewTurnOutput {
    const isClosingQuestion = memory.current?.type === "CLOSING";
    const intent = classifyIntent(
      text,
      memory.current ? toCurrentContext(ctx.snapshot, memory.current) : null,
      isClosingQuestion,
    );
    let action: InterviewAction;
    if (
      intent === "UNCLEAR" ||
      intent === "REPEAT_REQUEST" ||
      intent === "CLARIFICATION_REQUEST" ||
      intent === "HINT_REQUEST"
    ) {
      action = "CLARIFY";
    } else if (intent === "END_REQUEST" || plan.next.kind === "END") {
      action = "END_INTERVIEW";
    } else if (plan.next.kind === "CLOSING") {
      action = "ACKNOWLEDGE";
    } else {
      action = "ASK_QUESTION";
    }
    return {
      candidateIntent: intent,
      answerEvaluation: null,
      action,
      spokenText: this.deterministicText(ctx, memory, plan, action, intent),
      question: null,
      reasonInternal: "Deterministic fallback (model unavailable).",
    };
  }

  private deterministicText(
    ctx: EngineContext,
    memory: EngineMemory,
    plan: Plan,
    action: InterviewAction,
    intent: CandidateIntent,
  ): string {
    const phrases = phrasesFor(ctx.snapshot.language);
    const ack = phrases.acknowledgements[memory.turnCount % phrases.acknowledgements.length] ?? "";
    const closing = phrases.closing({
      firstName: ctx.candidate.firstName,
      jobTitle: ctx.snapshot.job.title,
    });
    switch (action) {
      case "CLARIFY":
        if (intent === "UNCLEAR" || !memory.current) return phrases.unclear;
        return `${phrases.repeatPrefix} ${memory.current.text}`;
      case "END_INTERVIEW":
        return closing;
      case "ACKNOWLEDGE":
        return plan.next.kind === "CLOSING" ? `${ack} ${phrases.closingQuestion}` : closing;
      case "ASK_FOLLOW_UP":
      case "ASK_QUESTION":
      case "MOVE_SECTION": {
        const next = plan.next;
        if (next.kind === "BANK") {
          const transition = next.isNewSection ? ` ${phrases.moveOnTo(next.section.name)}` : "";
          return `${ack}${transition} ${next.question.text}`.trim();
        }
        if (next.kind === "GENERATE") {
          const skill = next.skillKey
            ? (ctx.snapshot.skills.find((s) => s.key === next.skillKey)?.name ?? null)
            : null;
          return phrases.continueGeneric(skill);
        }
        if (next.kind === "CLOSING") return `${ack} ${phrases.closingQuestion}`;
        return closing;
      }
    }
  }

  private apply(
    ctx: EngineContext,
    memory: EngineMemory,
    plan: Plan,
    turn: CandidateTurn,
    decision: {
      intent: CandidateIntent;
      evaluation: AnswerEvaluation | null;
      action: InterviewAction;
      spoken: string;
      question: InterviewTurnOutput["question"];
    },
    forcedCompletion?: CompletionReason,
  ): EngineTurnResult {
    const { snapshot } = ctx;
    const current = memory.current;
    const elapsed = plan.timing.elapsedSeconds;

    // ── 1. Record what the candidate said ──
    let answered: AnsweredQuestion | null = null;
    let evaluation: AnswerEvaluation | null = null;
    const countsAsAnswer =
      current !== null &&
      (ANSWER_INTENTS.includes(decision.intent) ||
        (current.type === "CLOSING" &&
          (decision.intent === "CANDIDATE_QUESTION" || decision.intent === "OFF_TOPIC")) ||
        (forcedCompletion === "TIME_LIMIT" && turn.text.trim() !== ""));

    if (current && countsAsAnswer) {
      answered = {
        threadKey: current.threadKey,
        questionKey: current.questionKey,
        questionText: current.text,
        questionType: current.type,
        sectionKey: current.sectionKey,
        skillKey: current.skillKey,
        difficulty: current.difficulty,
        isFollowUp: current.isFollowUp,
        followUpDepth: current.followUpDepth,
        askedAtSeconds: current.askedAtSeconds,
      };
      evaluation = ANSWER_INTENTS.includes(decision.intent) ? decision.evaluation : null;
      if (evaluation) {
        if (current.skillKey) {
          const skill = recordSkillEvidence(memory, current.skillKey, {
            answerId: turn.answerId,
            threadKey: current.threadKey,
            evaluation,
          });
          if (skill && isAdaptive(snapshot))
            skill.targetDifficulty = nextDifficulty(current.difficulty, evaluation.score);
        }
        mergeFacts(memory, evaluation.candidateFacts);
      }
      if (decision.intent === "DONT_KNOW") memory.stats.dontKnowCount += 1;
      const summary =
        evaluation?.answerSummary ?? turn.text.trim().split(/\s+/).slice(0, 30).join(" ");
      addDigest(memory, `Q: ${current.primaryText.slice(0, 140)} → A: ${summary.slice(0, 260)}`);
    }
    appendTurn(memory, "CANDIDATE", turn.text.trim() || "(no speech detected)");
    memory.consecutiveUnclear = decision.intent === "UNCLEAR" ? memory.consecutiveUnclear + 1 : 0;

    // ── 2. Apply the interviewer's action ──
    let completion: CompletionReason | null = null;
    let reply: EngineReply;
    switch (decision.action) {
      case "ASK_FOLLOW_UP": {
        const base = current!;
        const followText = decision.question?.text?.trim() || decision.spoken;
        memory.current = {
          ...base,
          text: followText,
          isFollowUp: true,
          followUpDepth: base.followUpDepth + 1,
          askedAtSeconds: elapsed,
        };
        memory.followUpsAsked += 1;
        memory.clarificationsForCurrent = 0;
        memory.askedQuestionTexts.push(followText);
        reply = replyFor(decision.spoken, "ASK_FOLLOW_UP", memory.current);
        break;
      }
      case "ASK_QUESTION":
      case "MOVE_SECTION": {
        const next = plan.next;
        if (next.kind === "CLOSING") {
          reply = this.askClosing(
            memory,
            elapsed,
            decision.spoken,
            phrasesFor(snapshot.language).closingQuestion,
          );
          break;
        }
        if (next.kind === "END") {
          completion = forcedCompletion ?? "NORMAL";
          reply = this.end(memory, decision.spoken);
          break;
        }
        const question = this.startQuestion(
          memory,
          snapshot,
          next,
          decision.question,
          elapsed,
          decision.spoken,
        );
        reply = replyFor(
          decision.spoken,
          decision.action === "MOVE_SECTION" ? "MOVE_SECTION" : "ASK_QUESTION",
          question,
        );
        break;
      }
      case "ACKNOWLEDGE": {
        if (plan.next.kind === "CLOSING") {
          reply = this.askClosing(
            memory,
            elapsed,
            decision.spoken,
            decision.question?.text ?? phrasesFor(snapshot.language).closingQuestion,
          );
        } else {
          reply = replyFor(decision.spoken, "ACKNOWLEDGE", memory.current);
        }
        break;
      }
      case "END_INTERVIEW": {
        completion =
          forcedCompletion ??
          (decision.intent === "END_REQUEST" &&
          plan.next.kind !== "END" &&
          plan.next.kind !== "CLOSING"
            ? "CANDIDATE_ENDED"
            : plan.next.kind === "END"
              ? plan.next.reason
              : "NORMAL");
        reply = this.end(memory, decision.spoken);
        break;
      }
      case "CLARIFY":
      default: {
        memory.clarificationsForCurrent += 1;
        reply = replyFor(decision.spoken, "CLARIFY", memory.current);
        break;
      }
    }

    appendTurn(memory, "AI", reply.text);
    return {
      memory,
      reply,
      answered,
      evaluation,
      intent: decision.intent,
      completion,
      diagnostics: deterministicDiagnostics(""),
    };
  }

  private askClosing(
    memory: EngineMemory,
    elapsed: number,
    spoken: string,
    questionText: string,
  ): EngineReply {
    memory.phase = "CLOSING";
    memory.closingAsked = true;
    memory.clarificationsForCurrent = 0;
    memory.current = {
      threadKey: newThreadKey(),
      questionKey: null,
      primaryText: questionText,
      text: questionText,
      type: "CLOSING",
      skillKey: null,
      sectionKey: null,
      difficulty: "EASY",
      expectedTopics: [],
      redFlags: [],
      followUpGuidance: null,
      isFollowUp: false,
      followUpDepth: 0,
      askedAtSeconds: elapsed,
    };
    return replyFor(spoken, "ACKNOWLEDGE", memory.current);
  }

  private end(memory: EngineMemory, spoken: string): EngineReply {
    memory.phase = "ENDED";
    memory.current = null;
    return emptyReply(spoken, "END_INTERVIEW");
  }

  private startQuestion(
    memory: EngineMemory,
    snapshot: TemplateSnapshot,
    next: Extract<PlannedNext, { kind: "BANK" | "GENERATE" }>,
    modelQuestion: InterviewTurnOutput["question"],
    elapsed: number,
    spoken: string,
  ): CurrentQuestion {
    // Advance section bookkeeping; sections skipped over are marked complete.
    for (let i = memory.sectionIndex; i < next.sectionIndex; i += 1) {
      const state = memory.sections[i];
      if (state) state.completed = true;
    }
    memory.sectionIndex = next.sectionIndex;
    const sectionState = memory.sections[next.sectionIndex];
    if (sectionState) {
      if (sectionState.startedAtSeconds === null) sectionState.startedAtSeconds = elapsed;
      sectionState.questionsAsked += 1;
    }

    let question: CurrentQuestion;
    if (next.kind === "BANK") {
      const q = next.question;
      memory.askedQuestionKeys.push(q.key);
      question = {
        threadKey: newThreadKey(),
        questionKey: q.key,
        primaryText: q.text,
        text: q.text,
        type: q.type,
        skillKey: q.skillKey,
        sectionKey: next.section.key,
        difficulty: q.difficulty,
        expectedTopics: q.expectedTopics,
        redFlags: q.redFlags,
        followUpGuidance: q.followUpGuidance,
        isFollowUp: false,
        followUpDepth: 0,
        askedAtSeconds: elapsed,
      };
    } else {
      const text = modelQuestion?.text?.trim() || spoken;
      if (next.resumeHook) memory.resumeHooksUsed.push(next.resumeHook);
      question = {
        threadKey: newThreadKey(),
        questionKey: null,
        primaryText: text,
        text,
        type:
          modelQuestion?.type && modelQuestion.type !== "FOLLOW_UP"
            ? modelQuestion.type
            : next.type,
        skillKey: next.skillKey,
        sectionKey: next.section.key,
        difficulty: next.difficulty,
        expectedTopics: [],
        redFlags: [],
        followUpGuidance: null,
        isFollowUp: false,
        followUpDepth: 0,
        askedAtSeconds: elapsed,
      };
    }
    memory.phase = "QUESTIONING";
    memory.current = question;
    memory.primaryQuestionsAsked += 1;
    memory.clarificationsForCurrent = 0;
    memory.askedQuestionTexts.push(question.text);
    // Section of a just-exhausted bank: if every question of the section was asked, mark it complete
    const remaining = sectionQuestions(snapshot, next.section.key).filter(
      (q) => !memory.askedQuestionKeys.includes(q.key),
    );
    if (remaining.length === 0 && sectionState && !snapshot.aiSettings.allowDynamicQuestions)
      sectionState.completed = true;
    return question;
  }
}

// ───────────────────────── helpers ─────────────────────────

function emptyReply(text: string, action: InterviewAction): EngineReply {
  return {
    text,
    action,
    threadKey: null,
    questionKey: null,
    sectionKey: null,
    isFollowUp: false,
    questionType: null,
    skillKey: null,
    difficulty: null,
  };
}

function replyFor(
  text: string,
  action: InterviewAction,
  question: CurrentQuestion | null,
): EngineReply {
  if (!question) return emptyReply(text, action);
  return {
    text,
    action,
    threadKey: question.threadKey,
    questionKey: question.questionKey,
    sectionKey: question.sectionKey,
    isFollowUp: question.isFollowUp,
    questionType: question.type,
    skillKey: question.skillKey,
    difficulty: question.difficulty,
  };
}

function deterministicDiagnostics(reason: string): EngineTurnResult["diagnostics"] {
  return {
    usedFallback: false,
    deterministic: true,
    reasonInternal: reason,
    provider: "engine",
    model: "deterministic",
    promptVersion: "n/a",
    latencyMs: 0,
    directive: null,
  };
}

function toCurrentContext(
  snapshot: TemplateSnapshot,
  current: CurrentQuestion,
): CurrentQuestionContext {
  return {
    text: current.text,
    type: current.type,
    skillName: current.skillKey
      ? (snapshot.skills.find((s) => s.key === current.skillKey)?.name ?? null)
      : null,
    difficulty: current.difficulty,
    expectedTopics: current.expectedTopics,
    redFlags: current.redFlags,
    followUpGuidance: current.followUpGuidance,
    isFollowUp: current.isFollowUp,
    followUpDepth: current.followUpDepth,
    isBehavioral: current.type === "BEHAVIORAL" || current.type === "SITUATIONAL",
  };
}

export function toNextStep(snapshot: TemplateSnapshot, next: PlannedNext): NextStep {
  const skillName = (key: string | null) =>
    key ? (snapshot.skills.find((s) => s.key === key)?.name ?? null) : null;
  switch (next.kind) {
    case "BANK":
      return {
        kind: "BANK_QUESTION",
        questionId: next.question.key,
        text: next.question.text,
        type: next.question.type,
        skillName: skillName(next.question.skillKey),
        difficulty: next.question.difficulty,
        sectionName: next.section.name,
        isNewSection: next.isNewSection,
      };
    case "GENERATE":
      return {
        kind: "GENERATE_QUESTION",
        skillName: skillName(next.skillKey),
        type: next.type,
        difficulty: next.difficulty,
        sectionName: next.section.name,
        isNewSection: next.isNewSection,
        resumeHook: next.resumeHook,
      };
    case "CLOSING":
      return { kind: "CLOSING", askAnythingToAdd: next.askAnythingToAdd };
    case "END":
      return { kind: "END" };
  }
}

function toDirective(snapshot: TemplateSnapshot, plan: Plan): TurnDirective {
  return {
    allowedActions: plan.allowedActions,
    followUpAllowed: plan.followUpAllowed,
    followUpsRemaining: plan.followUpsRemaining,
    next: toNextStep(snapshot, plan.next),
    notes: plan.notes,
  };
}

/**
 * Enforce the planner's constraints on the model's chosen action. Anything
 * outside the allowed set is replaced by the planner's own next step.
 */
export function validateAction(output: InterviewTurnOutput, plan: Plan): InterviewAction {
  const allowed = new Set(plan.allowedActions);
  const { action, candidateIntent } = output;
  const moveOn: InterviewAction =
    plan.next.kind === "END"
      ? "END_INTERVIEW"
      : plan.next.kind === "CLOSING"
        ? "ACKNOWLEDGE"
        : "ASK_QUESTION";

  if (action === "END_INTERVIEW") {
    if (
      plan.next.kind === "END" ||
      plan.next.kind === "CLOSING" ||
      candidateIntent === "END_REQUEST"
    )
      return "END_INTERVIEW";
    return moveOn;
  }
  if (action === "ASK_FOLLOW_UP") return plan.followUpAllowed ? "ASK_FOLLOW_UP" : moveOn;
  if (action === "MOVE_SECTION") return allowed.has("MOVE_SECTION") ? "MOVE_SECTION" : moveOn;
  if (action === "ACKNOWLEDGE") return plan.next.kind === "CLOSING" ? "ACKNOWLEDGE" : moveOn;
  if (action === "ASK_QUESTION") return plan.next.kind === "END" ? "END_INTERVIEW" : "ASK_QUESTION";
  if (action === "CLARIFY") return "CLARIFY";
  return moveOn;
}
