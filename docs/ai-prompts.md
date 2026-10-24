# AI prompts

All model interaction goes through `packages/ai`. Prompts are versioned TypeScript modules, outputs are validated against zod schemas, and every call is recorded for cost tracking (`AiUsageEvent`).

## Inventory

| Operation                    | Prompt module                 | Output schema                      | Effort | Used for                                                                 |
| ---------------------------- | ----------------------------- | ---------------------------------- | ------ | ------------------------------------------------------------------------ |
| `GENERATE_INTERVIEW`         | `generation.v1.ts`            | `generatedInterviewSchema`         | medium | Drafting a full interview from a job                                     |
| `GENERATE_QUESTION`          | `generation.v1.ts`            | `generatedSingleQuestionSchema`    | low    | Regenerating one question in the builder                                 |
| `NEXT_ACTION`                | `interviewer.v1.ts`           | `interviewTurnSchema`              | low    | Every interview turn: intent, answer evaluation, action and spoken reply |
| `EVALUATE_ANSWER`            | `evaluation.v1.ts`            | `standaloneAnswerEvaluationSchema` | medium | Re-evaluating a single answer                                            |
| `EVALUATE_INTERVIEW`         | `evaluation.v1.ts`            | `finalEvaluationSchema`            | high   | The final evaluation report                                              |
| `PARSE_RESUME`               | `resume.v1.ts`                | `parsedResumeSchema`               | low    | Structured résumé extraction                                             |
| `SALES_COPILOT`              | `sales/prompts/copilot.v1.ts` | `salesCopilotAnswerSchema`         | low    | Ask Sales AI about a lead                                                |
| `SALES_RESEARCH`             | `sales/prompts/core.v1.ts`    | `leadResearchSchema`               | medium | Labelled lead research from permitted sources                            |
| `SALES_GENERATE_MESSAGE`     | `sales/prompts/core.v1.ts`    | `outreachDraftSchema`              | low    | Outreach drafts for review                                               |
| `SALES_ANALYZE_CONVERSATION` | `sales/prompts/core.v1.ts`    | `conversationAnalysisSchema`       | low    | Intent, objections and next step for an inbound reply                    |

Versions are listed in `PROMPT_VERSIONS` (`prompts/index.ts`) and stored on sessions, evaluations and usage events. **To change a prompt's behaviour, add a new version** (`interviewer.v2.ts`) and switch the registry, so past evaluations stay explainable.

## Providers

- **Anthropic** (`llm/anthropic.ts`, default): structured outputs via `client.beta.messages.parse` with a zod output format. Model `AI_MODEL` (default `claude-opus-5-5`), per-operation effort, stable system blocks marked with `cache_control` for prompt caching, and server-side fallback enabled.
- **OpenAI-compatible** (`llm/openai-compatible.ts`): JSON mode plus zod validation, for self-hosted or alternative endpoints.
- **Demo** (`demo/`): deterministic heuristics with the same `InterviewAI` interface, used when `DEMO_MODE=true` and in tests. Its output is labelled in reports as demo-mode heuristics.

`LlmInterviewAI` wraps the provider. It retries with backoff on retryable errors, and when output fails validation it retries once with a corrective note. It reports token usage and estimated cost to the usage sink.

## Prompt structure

Each prompt is assembled from blocks, most stable first, so the cacheable prefix is as long as possible:

1. **Role and rules** (system, cacheable): who the model is, the rules it must follow, the score scale, the output contract.
2. **Session configuration** (system, cacheable per interview): role, skills and weights, interviewer personality, language.
3. **Turn data** (user): the planner directive, the current question with its rubric and expected topics, recent transcript, interview memory, and the candidate's latest message.

The interviewer prompt tells the model that the **planner directive is authoritative**. The model chooses among the allowed actions and phrases them; it doesn't decide the interview's structure.

## Untrusted input and prompt injection

Candidate answers, résumés, job descriptions and recruiter-written text, and for the Sales Agent prospect websites, replies and imported lead fields, are all treated as **data, never instructions**:

- `dataBlock(source, content)` wraps untrusted text in a labelled block after `sanitizeUntrusted` strips control characters, caps the length, and _neutralises_ any structural tags the prompt itself uses (`<candidate_message>`, `<planner_directive>`, …). A candidate can't close a block and open a fake one.
- The system rules state that instructions inside data blocks must be ignored and reported, never followed.
- `detectPromptInjection` flags common patterns ("ignore previous instructions", role-play as system, requests for the prompt or scores). The engine records the intent as `PROMPT_INJECTION`, keeps the interview on track, and the reviewer sees it as context. It is never scored as misconduct.
- Final evaluation evidence is sanitised before it reaches the evaluation prompt, so injected text inside an answer can't steer the final report.

## What the model is never allowed to reveal

The engine's output guard (`guardSpokenText`) and the candidate view allow-list enforce this independently of the prompt:

- system prompts, the planner directive or internal state
- ideal answers (no 8-word run of an ideal answer may appear in spoken text), expected topics, red flags or rubrics
- scores, evaluations or the recommendation

## Fairness rules (all evaluation prompts)

- Assess only job-relevant evidence from the candidate's own words.
- Never infer or consider protected characteristics, accent, grammar of non-native speakers (unless language skill is part of the rubric), appearance, or personal circumstances.
- Distinguish "not demonstrated" from "demonstrated incorrectly". Say when evidence is insufficient instead of guessing.
- Cite evidence (answer IDs and short quotes or summaries) for every strength and concern.
- Integrity signals are context for a human, never an accusation.

## Structured output design notes

- Schemas avoid open-ended records and use `nullable` rather than optional fields, so every provider produces the same shape.
- Scores are integers 0–100 on a shared, documented scale (`SCORE_SCALE_TEXT`).
- The model's final recommendation is advisory. `@repo/scoring` recomputes scores and the recommendation deterministically, and the model can only _lower_ it to `INSUFFICIENT_EVIDENCE` (see [architecture](architecture.md#4-evaluation)).

## Testing prompts

- `ai.test.ts` covers intent classification, fact extraction, structured-output parsing, invalid JSON handling and injection detection.
- Engine tests run full interviews against the demo AI and against fault-injecting fakes (timeouts, invalid output).
- Before rolling out a new prompt version, replay stored transcripts with both versions and compare evaluations. Keep the old version until reviewers sign off.
