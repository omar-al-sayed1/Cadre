import type { z } from "zod";
import {
  buildAnswerEvaluationSystem,
  buildAnswerEvaluationUserMessage,
  buildEvaluationSystem,
  buildEvaluationUserMessage,
  ANSWER_EVALUATION_PROMPT_VERSION,
  EVALUATION_PROMPT_VERSION,
} from "../prompts/evaluation.v1";
import {
  buildGenerateInterviewSystem,
  buildGenerateInterviewUserMessage,
  buildGenerateQuestionUserMessage,
  QUESTION_GENERATOR_PROMPT_VERSION,
} from "../prompts/generation.v1";
import {
  buildInterviewerSystem,
  buildInterviewerUserMessage,
  INTERVIEWER_PROMPT_VERSION,
} from "../prompts/interviewer.v1";
import {
  buildResumeSystem,
  buildResumeUserMessage,
  RESUME_PARSER_PROMPT_VERSION,
} from "../prompts/resume.v1";
import {
  finalEvaluationSchema,
  generatedInterviewSchema,
  generatedSingleQuestionSchema,
  interviewTurnSchema,
  parsedResumeSchema,
  standaloneAnswerEvaluationSchema,
} from "../schemas";
import type { LLMProvider } from "../llm/types";
import type { AiTelemetrySink } from "../telemetry";
import { StructuredCaller, type CallSpec } from "./structured-caller";
import type {
  AiCallMeta,
  AiResult,
  EvaluateAnswerInput,
  FinalEvaluationInput,
  GenerateInterviewInput,
  GenerateQuestionInput,
  InterviewAI,
  ParseResumeInput,
  TurnInput,
} from "./types";

export interface LlmInterviewAIOptions {
  provider: LLMProvider;
  /** Model for latency-sensitive interview turns; defaults to the provider's model. */
  turnModel?: string;
  telemetry?: AiTelemetrySink;
  /** Extra attempts after a retryable failure (invalid output, timeout, rate limit). */
  maxAttempts?: number;
}

/** Production InterviewAI: versioned prompts over any LLMProvider, with retries and telemetry. */
export class LlmInterviewAI implements InterviewAI {
  readonly providerName: string;
  readonly modelName: string;
  private readonly caller: StructuredCaller;

  constructor(private readonly options: LlmInterviewAIOptions) {
    this.providerName = options.provider.name;
    this.modelName = options.provider.defaultModel;
    this.caller = new StructuredCaller({
      provider: options.provider,
      telemetry: options.telemetry,
      maxAttempts: options.maxAttempts,
    });
  }

  private call<TSchema extends z.ZodType>(
    spec: CallSpec<TSchema>,
    meta: AiCallMeta = {},
  ): Promise<AiResult<z.infer<TSchema>>> {
    return this.caller.call(spec, { ...meta, agentType: "INTERVIEWER" });
  }

  generateInterview(input: GenerateInterviewInput, meta?: AiCallMeta) {
    return this.call(
      {
        operation: "GENERATE_INTERVIEW",
        promptVersion: QUESTION_GENERATOR_PROMPT_VERSION,
        system: buildGenerateInterviewSystem(),
        user: buildGenerateInterviewUserMessage(input),
        schema: generatedInterviewSchema,
        schemaName: "generated_interview",
        effort: "medium",
        maxTokens: 32_000,
        timeoutMs: 180_000,
      },
      meta,
    );
  }

  async generateQuestion(input: GenerateQuestionInput, meta?: AiCallMeta) {
    const result = await this.call(
      {
        operation: "GENERATE_INTERVIEW",
        promptVersion: QUESTION_GENERATOR_PROMPT_VERSION,
        system: buildGenerateInterviewSystem(),
        user: buildGenerateQuestionUserMessage(input),
        schema: generatedSingleQuestionSchema,
        schemaName: "generated_question",
        effort: "low",
        maxTokens: 8_000,
      },
      meta,
    );
    return { ...result, data: result.data.question };
  }

  getNextInterviewAction(input: TurnInput, meta?: AiCallMeta) {
    return this.call(
      {
        operation: "NEXT_ACTION",
        promptVersion: INTERVIEWER_PROMPT_VERSION,
        system: buildInterviewerSystem(input),
        user: buildInterviewerUserMessage(input),
        schema: interviewTurnSchema,
        schemaName: "interview_turn",
        // Turns are latency-sensitive: low effort keeps the conversation responsive.
        effort: "low",
        maxTokens: 8_000,
        model: this.options.turnModel,
        timeoutMs: 30_000,
      },
      meta,
    );
  }

  evaluateAnswer(input: EvaluateAnswerInput, meta?: AiCallMeta) {
    return this.call(
      {
        operation: "EVALUATE_ANSWER",
        promptVersion: ANSWER_EVALUATION_PROMPT_VERSION,
        system: buildAnswerEvaluationSystem(input),
        user: buildAnswerEvaluationUserMessage(input),
        schema: standaloneAnswerEvaluationSchema,
        schemaName: "answer_evaluation",
        effort: "medium",
        maxTokens: 8_000,
      },
      meta,
    );
  }

  evaluateInterview(input: FinalEvaluationInput, meta?: AiCallMeta) {
    return this.call(
      {
        operation: "EVALUATE_INTERVIEW",
        promptVersion: EVALUATION_PROMPT_VERSION,
        system: buildEvaluationSystem(input),
        user: buildEvaluationUserMessage(input),
        schema: finalEvaluationSchema,
        schemaName: "final_evaluation",
        // Final evaluation is offline and quality-critical.
        effort: "high",
        maxTokens: 32_000,
        timeoutMs: 300_000,
      },
      meta,
    );
  }

  parseResume(input: ParseResumeInput, meta?: AiCallMeta) {
    return this.call(
      {
        operation: "PARSE_RESUME",
        promptVersion: RESUME_PARSER_PROMPT_VERSION,
        system: buildResumeSystem(),
        user: buildResumeUserMessage(input.text),
        schema: parsedResumeSchema,
        schemaName: "parsed_resume",
        effort: "low",
        maxTokens: 16_000,
        timeoutMs: 120_000,
      },
      meta,
    );
  }
}
