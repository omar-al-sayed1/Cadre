# Interview engine

`packages/interview-engine` decides what happens at every turn of an interview. It is pure TypeScript with no database or network access. It receives the published template snapshot, the session's memory and the candidate's answer, and returns the interviewer's reply, the updated memory and the stored evaluation. `packages/core/src/services/candidate-session.ts` handles persistence, locking and idempotency around it.

## Design principle: deterministic control, generative language

Flow control lives in the **planner**: which question comes next, whether a follow-up is allowed, the difficulty, the time phase, and when to close. Phrasing, intent detection and answer evaluation come from **one LLM call per turn**. The engine then validates the model's choice against the planner's directive, guards the spoken text, and falls back to deterministic behaviour when the model fails.

That gives predictable cost and latency, interviews that can't run off-script or over time, and logic that is fully unit-testable with a simulated AI.

```
           ┌──────────── plan() ────────────┐        ┌──────── InterviewAI.turn() ────────┐
answer ──▶ │ project pending answer         │ ─────▶ │ classify intent                    │
           │ timing phase (normal/wrap/over)│ direc- │ evaluate the answer (score,        │
           │ coverage & priorities per skill│ tive   │   concepts, STAR, facts)           │
           │ follow-up allowance            │        │ choose an allowed action           │
           │ next step: BANK / GENERATE /   │        │ phrase the reply                   │
           │   CLOSING / END                │        └───────────────┬────────────────────┘
           └────────────────────────────────┘                        │
                                         validateAction() ◀──────────┘
                                         guardSpokenText()
                                         update memory (evidence, facts, difficulty)
```

## Memory

`EngineMemory` (zod-validated, stored as JSON on the session) holds:

- the current question (key, skill, thread, follow-up count, difficulty)
- the questions and keys already asked (prevents repeats)
- per-skill evidence: coverage, confidence, a running score and up to 12 evidence items
- candidate facts extracted from answers (up to 40), used for personalised follow-ups
- recent turns (12) plus a rolling digest for long interviews
- section index, primary-question count, consecutive AI failures

## Planner

### Skill priority

When the planner chooses the next primary question, it ranks skills:

```
priority = importance × (0.15 + evidenceGap) × uncertainty
importance  = skill weight share (×1.5 if the skill is critical)
evidenceGap = 1 − coverage
uncertainty = max(0.2, 1 − 0.8 × confidence)
```

A skill with full coverage and confidence ≥ 0.75 drops to zero. Because one call both evaluates the pending answer and phrases the next question, the planner _projects_ the pending answer (assumed confidence 0.6). That stops it from re-targeting the skill the candidate just answered.

### Next step

1. Stay in the current section while it has unasked bank questions and its question budget allows.
2. Prefer **bank questions** (the recruiter's own) for the highest-priority skill at the target difficulty.
3. Otherwise ask the AI to **generate** a question for that skill; with résumé data, it may reference a relevant project ("resume hook").
4. Near-duplicates of anything already asked are rejected (Jaccard similarity on significant words).

### Follow-ups

A follow-up is allowed when the answer evaluation asks for one (missing concepts, incomplete STAR structure, vague answer) and the thread is under its budget: the template's `maxFollowUps` (default 2, absolute max 4). Diminishing returns cut the budget to one when an answer in the thread scored ≤ 35, so a struggling candidate isn't drilled. "I don't know" answers move on immediately and kindly.

### Adaptive difficulty

In adaptive mode each skill has a target difficulty (`EASY` / `MEDIUM` / `HARD`). It starts from the job's expected level, steps up after a score ≥ 75 and down after a score ≤ 45.

### Time management

| Phase    | When              | Behaviour                                                                                     |
| -------- | ----------------- | --------------------------------------------------------------------------------------------- |
| Normal   | < 90% of duration | Regular planning                                                                              |
| Wrap-up  | ≥ 90%             | No new primary questions beyond what fits; move to the closing question                       |
| Overtime | past the duration | Close politely; hard stop after a 180 s grace period, or immediately with _strict time limit_ |

About one minute is reserved for the closing, and a primary question is budgeted at about two minutes.

## Candidate intents

The model (or demo heuristics) classifies each message as `ANSWER`, `DONT_KNOW`, `REPEAT_REQUEST`, `CLARIFICATION_REQUEST`, `HINT_REQUEST`, `CANDIDATE_QUESTION`, `LANGUAGE_REQUEST`, `END_REQUEST`, `PROMPT_INJECTION` or `UNCLEAR`. Non-answers don't consume the question:

- _Repeat / clarify_ re-asks or rephrases without changing the question.
- _Hint_ gets a gentle nudge that never reveals the expected answer.
- _Prompt injection_ is treated as an off-topic answer. The interviewer redirects to the question, and the attempt is recorded for the reviewer as context.
- _End request_ confirms, then completes the session with `CANDIDATE_ENDED`.

## Validation and guardrails

- `validateAction` coerces the model's action to one the directive allows (for example, `ASK_FOLLOW_UP` becomes the planned next question when the follow-up budget is exhausted).
- `guardSpokenText` blocks text that leaks internals (scores, rubric terms, internal tags, any 8-word run of an ideal answer) and caps length at 1,200 characters. Blocked text is replaced by safe deterministic phrasing.
- The candidate-facing view (`getCandidateSessionView`) is built from an allow-list of fields; integration tests assert that no scores, rubrics or internal state reach the browser.

## Failure handling

| Failure                    | Behaviour                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM timeout / invalid JSON | Retried with a corrective note. Then the engine falls back to a deterministic reply (next planned question) and records the turn as lower-confidence. |
| 3 consecutive AI failures  | The session is paused with a friendly message (`EngineUnavailableError`). The candidate can retry; progress is kept.                                  |
| Network drop (client)      | The answer is kept on the device and resubmitted with the same `clientMessageId`; the server replays the stored reply instead of processing it twice. |
| Concurrent submissions     | Optimistic concurrency on `stateVersion` plus a turn lock; stale locks (> 90 s) are recoverable.                                                      |
| Abandoned session          | A heartbeat gap pauses the session. `sessions.expire-abandoned` closes it later and evaluates whatever evidence exists.                               |

## State machines

- **Session** (`SESSION_TRANSITIONS`): `CREATED → READY → STARTING → (AI_SPEAKING ⇄ WAITING_FOR_CANDIDATE ⇄ CANDIDATE_SPEAKING → PROCESSING_ANSWER → GENERATING_RESPONSE)… → FINISHING → COMPLETED`, with `PAUSED`, `RECONNECTING`, `FAILED`, `EXPIRED`. Every transition is asserted. Terminal states never reopen; a failed attempt is replaced by a new attempt if the invitation allows.
- **Client** (`clientTransition`): the interview room's UI state (idle, AI speaking, listening, processing, paused, reconnecting, completed), kept separate from the server state so UI glitches can't corrupt the session.

## Testing

- `engine.test.ts` / `planner.test.ts` / `state-machine.test.ts` cover strong, weak and "I don't know" candidates, prompt injection, repeat requests, invalid model output, timeouts, time limits and leak prevention, using `testing/simulate.ts` and fixtures.
- `scripts/transcript.ts` prints a full simulated interview for manual review (`pnpm --filter @repo/core exec tsx ../interview-engine/scripts/transcript.ts [strong|weak]`).
- Integration tests in `packages/core` run complete interviews against PostgreSQL.
