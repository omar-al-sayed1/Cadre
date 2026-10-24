export * from "./safety";
export { INTERVIEWER_PROMPT_VERSION } from "./interviewer.v1";
export { EVALUATION_PROMPT_VERSION, ANSWER_EVALUATION_PROMPT_VERSION } from "./evaluation.v1";
export { QUESTION_GENERATOR_PROMPT_VERSION } from "./generation.v1";
export { RESUME_PARSER_PROMPT_VERSION } from "./resume.v1";

/** Registry of the prompt versions currently in use (recorded on every evaluation). */
export const PROMPT_VERSIONS = {
  interviewer: "interviewer_prompt_v1",
  evaluation: "evaluation_prompt_v1",
  answerEvaluation: "answer_evaluation_prompt_v1",
  questionGenerator: "question_generator_v1",
  resumeParser: "resume_parser_v1",
} as const;
