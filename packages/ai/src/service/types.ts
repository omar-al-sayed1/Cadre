import type {
  CategoryWeightsLike,
  ExperienceLevelLike,
  InterviewAction,
  InterviewType,
  InterviewerPersonality,
  QuestionDifficulty,
  QuestionType,
  SkillLevel,
} from "./domain";
import type {
  FinalEvaluationOutput,
  GeneratedInterview,
  GeneratedQuestion,
  InterviewTurnOutput,
  ParsedResume,
  StandaloneAnswerEvaluation,
} from "../schemas";

/**
 * The application-facing AI contract (spec §83). Implementations:
 *  - LlmInterviewAI  — production: versioned prompts on top of any LLMProvider
 *  - DemoInterviewAI — DEMO_MODE: deterministic heuristics, no network calls
 */
export interface InterviewAI {
  readonly providerName: string;
  readonly modelName: string;
  generateInterview(
    input: GenerateInterviewInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<GeneratedInterview>>;
  generateQuestion(
    input: GenerateQuestionInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<GeneratedQuestion>>;
  getNextInterviewAction(
    input: TurnInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<InterviewTurnOutput>>;
  evaluateAnswer(
    input: EvaluateAnswerInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<StandaloneAnswerEvaluation>>;
  evaluateInterview(
    input: FinalEvaluationInput,
    meta?: AiCallMeta,
  ): Promise<AiResult<FinalEvaluationOutput>>;
  parseResume(input: ParseResumeInput, meta?: AiCallMeta): Promise<AiResult<ParsedResume>>;
}

/** Which AI employee made a call (mirrors the AgentType enum). */
export type AgentKind = "INTERVIEWER" | "SALES";

export interface AiCallMeta {
  companyId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  agentType?: AgentKind | null;
  signal?: AbortSignal;
}

export interface AiResult<T> {
  data: T;
  promptVersion: string;
  provider: string;
  model: string;
}

// ───────────────────────── Shared context ─────────────────────────

export interface JobSkillContext {
  key: string;
  name: string;
  weight: number;
  expectedLevel: SkillLevel;
  critical: boolean;
}

export interface JobContext {
  title: string;
  companyName: string;
  experienceLevel: ExperienceLevelLike;
  /** Untrusted recruiter-authored text; rendered inside a data block. */
  description: string;
  requirements: string;
  responsibilities: string;
  skills: JobSkillContext[];
}

export interface InterviewerContext {
  name: string;
  personality: InterviewerPersonality;
  language: string;
  interviewType: InterviewType;
  durationMinutes: number;
}

// ───────────────────────── Generation ─────────────────────────

export interface GenerateInterviewInput {
  job: JobContext;
  interviewType: InterviewType;
  durationMinutes: number;
  language: string;
  additionalInstructions?: string | null;
}

export interface GenerateQuestionInput {
  job: JobContext;
  sectionName: string;
  skillName: string | null;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  avoid: string[];
  language: string;
}

// ───────────────────────── Interview turn ─────────────────────────

export interface TranscriptTurn {
  role: "AI" | "CANDIDATE";
  text: string;
}

export interface SkillCoverageSnapshot {
  skill: string;
  weight: number;
  coverage: number;
  confidence: number;
  lastScore: number | null;
  targetDifficulty: QuestionDifficulty;
}

export interface CurrentQuestionContext {
  text: string;
  type: QuestionType;
  skillName: string | null;
  difficulty: QuestionDifficulty;
  /** Server-only grading hints (never spoken). */
  expectedTopics: string[];
  redFlags: string[];
  followUpGuidance: string | null;
  isFollowUp: boolean;
  followUpDepth: number;
  isBehavioral: boolean;
}

export type NextStep =
  | {
      kind: "BANK_QUESTION";
      questionId: string;
      text: string;
      type: QuestionType;
      skillName: string | null;
      difficulty: QuestionDifficulty;
      sectionName: string;
      isNewSection: boolean;
    }
  | {
      kind: "GENERATE_QUESTION";
      skillName: string | null;
      type: QuestionType;
      difficulty: QuestionDifficulty;
      sectionName: string;
      isNewSection: boolean;
      resumeHook: string | null;
    }
  | { kind: "CLOSING"; askAnythingToAdd: boolean }
  | { kind: "END" };

export interface TurnDirective {
  allowedActions: InterviewAction[];
  followUpAllowed: boolean;
  followUpsRemaining: number;
  next: NextStep;
  /** Deterministic guidance from the planner, e.g. time pressure. */
  notes: string[];
}

export interface TurnInput {
  job: JobContext;
  interviewer: InterviewerContext;
  candidateFirstName: string;
  /** Untrusted resume highlights. */
  resumeHighlights: string[];
  memory: {
    summary: string[];
    candidateFacts: string[];
    coverage: SkillCoverageSnapshot[];
    askedQuestions: string[];
  };
  recentTranscript: TranscriptTurn[];
  currentQuestion: CurrentQuestionContext | null;
  candidateMessage: string;
  directive: TurnDirective;
  timing: {
    elapsedSeconds: number;
    remainingSeconds: number;
    phase: "NORMAL" | "WRAP_UP" | "OVERTIME";
  };
}

// ───────────────────────── Evaluation ─────────────────────────

export interface EvaluateAnswerInput {
  job: JobContext;
  question: CurrentQuestionContext;
  answer: string;
  code?: {
    language: string;
    source: string;
    testResults: Array<{ name: string; passed: boolean }> | null;
  } | null;
}

export interface EvaluationThreadTurn {
  answerId: string;
  question: string;
  answer: string;
  isFollowUp: boolean;
  /** Interim (per-turn) assessment. Not shown to the final evaluator model to avoid anchoring. */
  interimScore: number | null;
  interimSummary: string | null;
  interimConfidence: number | null;
}

export interface EvaluationThread {
  threadKey: string;
  sectionName: string | null;
  skillKey: string | null;
  skillName: string | null;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  turns: EvaluationThreadTurn[];
}

export interface FinalEvaluationInput {
  job: JobContext;
  interviewer: InterviewerContext;
  categoryWeights: CategoryWeightsLike;
  threads: EvaluationThread[];
  resume: ParsedResume | null;
  completionReason: string;
  durationSeconds: number;
}

export interface ParseResumeInput {
  text: string;
}
