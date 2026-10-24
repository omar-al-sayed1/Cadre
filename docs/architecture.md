# Architecture

Cadre is a TypeScript monorepo (pnpm workspaces): one Next.js application, one background worker, and a set of focused packages. Business logic lives in `packages/core`; the web app is a thin layer of pages, API routes and client components on top of it. Each AI employee (AI Interviewer, AI Sales Agent, …) is a product module on a shared platform layer rather than a separate application.

## Platform layer

| Piece           | Where                                                    | Role                                                                                                                     |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Product catalog | `packages/config/src/products.ts`                        | Stable product keys, names, routes, availability and default plans                                                       |
| Plans           | `plan` table                                             | Seeded from the catalog; prices, limits and trial length are data, not code                                              |
| Subscriptions   | `product_subscription`, `core/services/subscriptions.ts` | One per company and product. `assertEntitled` gates new work; cancelled or expired products stay readable                |
| Agent registry  | `core/agents/registry.ts`                                | `AgentDefinition` per AI employee: capabilities, configuration, usage; `checkAgentAccess`                                |
| Shared services | `core`                                                   | Auth, companies, team and roles, permissions, audit, notifications, rate limits, usage and AI cost tracking, job queue   |
| Shared AI layer | `packages/ai`                                            | One `StructuredCaller` (retries, validation, usage telemetry with `agentType`) used by `LlmInterviewAI` and `LlmSalesAI` |
| Navigation      | `apps/web/src/components/shell/nav-items.ts`             | Platform links plus a section per subscribed product                                                                     |

Adding an AI employee means: a catalog entry, plan defaults, an `AgentDefinition`, its services under `core/services/<product>`, its AI interface in `packages/ai`, and a route group in the web app. See [AI Sales Agent](sales-agent.md) for the second product.

## System overview

```
                 ┌──────────────────────────── apps/web (Next.js 16) ─────────────────────────────┐
 Recruiter ────▶ │ (app) pages · settings · admin           API routes (/api/*)    proxy.ts      │
 browser         │   server components call @repo/core      route() wrapper:       (auth gate,   │
                 │                                          auth, CSRF origin,     security       │
 Candidate ────▶ │ /i/[token] pages · interview room        validation, errors     headers)       │
 browser         │   voice pipeline (STT/TTS/VAD) in hooks                                         │
                 └───────────────┬────────────────────────────────────────────────────────────────┘
                                 │
                 ┌───────────────▼──────────────── packages/core ─────────────────────────────────┐
                 │ services: company, team, jobs, candidates, resumes, templates, invitations,     │
                 │ candidate-session, evaluation, results, analytics, privacy, admin, lifecycle    │
                 │ cross-cutting: permissions (RBAC), audit, rate-limit, feature-flags, usage      │
                 └───┬──────────┬─────────────┬─────────────┬──────────────┬──────────────┬────────┘
                     │          │             │             │              │              │
             interview-engine  ai          scoring        voice        storage/email     queue
             (planner, state   (providers, (aggregation,  (STT/TTS)    (files, mail)     (Postgres
              machines, guard)  prompts)    recommendation)                               jobs)
                     │                                                                     │
                     └──────────────────────── packages/database (Prisma 7 + PostgreSQL) ◀──┘
                                                                     ▲
                                                 apps/worker ────────┘ (evaluations, emails,
                                                                        reminders, retention)
```

## Layers and responsibilities

| Layer                         | Owns                                                                             | Must not                                            |
| ----------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| `apps/web` pages & components | Rendering, client state, the in-browser voice pipeline                           | Query the database directly or embed business rules |
| `apps/web` API routes         | HTTP concerns: auth context, CSRF/origin checks, body parsing, error mapping     | Contain domain logic (they call one core service)   |
| `packages/core`               | Domain services, tenancy and permission checks, transactions, audit entries      | Know about HTTP or React                            |
| `packages/interview-engine`   | Pure interview logic: planning, state transitions, memory, guardrails            | Touch the database or network                       |
| `packages/ai`                 | Talking to LLMs: prompts, schemas, retries, demo stand-in                        | Decide interview flow (the engine does)             |
| `packages/scoring`            | Deterministic aggregation of answer evaluations into scores and a recommendation | Call an LLM                                         |

Every core service takes an `ActorContext` (`userId`, `companyId`, `role`) and scopes every query by `companyId`. Permission checks (`requirePermission`) happen inside services, so an API route can't forget them.

## Key flows

### 1. Interview creation

1. A recruiter creates a job with weighted skills (weights total 100).
2. `generateTemplateDraft` asks the AI for a structured interview (sections, questions, expected topics, rubrics, ideal answers, follow-up guidance) and validates it against `generatedInterviewSchema`.
3. The recruiter edits the draft in the builder (`InterviewTemplate` + `InterviewSection` + `InterviewQuestion`).
4. **Publishing** freezes everything the interview needs into an immutable `InterviewTemplateVersion.snapshot`. Sessions always run against a snapshot, so editing a template never changes an interview in progress.

### 2. Invitation

`createInvitation` generates a 256-bit token, stores only its SHA-256 hash, and returns the link once. Resending rotates the token, so the old link stops working. The candidate landing page resolves the token by hash and exposes only what the candidate needs: masked email, company branding, duration, topics.

### 3. The live interview

```
Candidate consent ──▶ begin: session row + versioned consent records + httpOnly session cookie
Begin interview ────▶ start: engine.begin() → welcome message
Each answer ────────▶ POST /message { clientMessageId, content }
                      1. idempotency: replay if clientMessageId already answered
                      2. turn lock: optimistic concurrency on session.stateVersion
                      3. engine.respond(): planner directive → one LLM call → validation/guard
                      4. transaction: candidate message, answer + evaluation, AI message, new state
                      5. response: AI message + candidate-safe session view
Completion ─────────▶ enqueue interview.evaluate + interview.post-completion jobs
```

The candidate's browser handles voice: browser speech recognition (or server STT through recorded audio uploads), browser speech synthesis (or streamed server TTS), and energy-based voice-activity detection for end-of-answer and barge-in. Transport is plain HTTPS request/response plus a 15-second heartbeat. That's enough because the interview is strictly turn-based (see _Decisions_).

### 4. Evaluation

`runFinalEvaluation` (queue job, retried with backoff) builds evidence threads from the stored per-answer evaluations, asks the AI for a structured final evaluation, then **re-derives scores deterministically** with `@repo/scoring`: per-skill scores weighted by the job rubric, a confidence level capped by how much evidence exists, and the recommendation from fixed thresholds. The model may only _lower_ the recommendation (to `INSUFFICIENT_EVIDENCE`), never raise it. Prompt and scoring versions are recorded on every evaluation.

### 5. Review

Reports, comparison and analytics read the stored evaluation. Recruiters can override the score or recommendation with a mandatory reason. The original AI values are kept, and the override is written to the audit log.

## Background work

`packages/queue` implements a PostgreSQL job queue (`background_job` table): `FOR UPDATE SKIP LOCKED` claiming, unique keys for idempotent enqueueing, exponential backoff, stale-lock recovery and recurring jobs.

| Job                                                 | Purpose                                       |
| --------------------------------------------------- | --------------------------------------------- |
| `interview.evaluate`                                | Final evaluation (idempotent unless `force`)  |
| `interview.post-completion`                         | Notifications, application stage updates      |
| `resume.parse`                                      | Résumé text extraction and structured parsing |
| `email.send`                                        | Transactional email                           |
| `invitations.send-reminders` / `invitations.expire` | Every 15 min                                  |
| `sessions.expire-abandoned`                         | Every 10 min                                  |
| `retention.sweep` / `privacy.delete`                | Data retention and deletion requests          |
| `maintenance.cleanup`                               | Expired rate-limit buckets, finished jobs     |
| `sales.research-lead`                               | Lead research (website reader + AI)           |
| `sales.rescore-leads`                               | Rescore a workspace after scoring changes     |

In development the web server runs an inline worker (`QUEUE_INLINE_WORKER=true`, started from `instrumentation.ts`). In production, run `apps/worker` as its own process; scale it horizontally if needed.

## Providers and configuration

Every external dependency sits behind an interface and is selected by environment variables, validated at startup by the zod schema in `packages/config/src/env.ts`:

| Concern        | Options                                                            | Demo mode                           |
| -------------- | ------------------------------------------------------------------ | ----------------------------------- |
| LLM            | Anthropic (default `claude-opus-5-5`), OpenAI-compatible           | Deterministic heuristic interviewer |
| Speech-to-text | Browser, OpenAI, Deepgram                                          | Browser                             |
| Text-to-speech | Browser, OpenAI, ElevenLabs                                        | Browser                             |
| Storage        | Local disk, S3, Cloudflare R2, Supabase                            | Local                               |
| Email          | Console, Resend, SMTP                                              | Console                             |
| Lead research  | `website` (the lead's own site) or `none`, via `RESEARCH_PROVIDER` | Website reader with the demo AI     |

## Decisions and assumptions

| Decision                                          | Why                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTTP turns + heartbeat instead of WebSockets**  | The interview is strictly turn-based and every turn is a transaction, so request/response gives idempotency, retries and load balancing for free. Streaming STT/TTS can be added later as a dedicated realtime gateway without changing the engine. |
| **PostgreSQL job queue instead of Redis/BullMQ**  | One fewer service to run; jobs commit in the same transaction as the data that triggers them. `docker-compose.yml` keeps an optional Redis profile for later.                                                                                       |
| **Deterministic planner + one LLM call per turn** | Predictable cost and latency, testable flow control, and the model can't skip sections, run over time or ask unlimited follow-ups.                                                                                                                  |
| **Scores re-derived outside the model**           | Reproducible, explainable scores. A model can't inflate a recommendation, and the scoring logic is versioned and unit-tested.                                                                                                                       |
| **Better Auth** for recruiter authentication      | Email/password with verification and reset, optional Google, database sessions in our schema, built-in rate limits. Candidates never get accounts: they use invitation tokens and per-session credentials.                                          |
| **Prisma 7** with the `pg` driver adapter         | Typed queries and formal SQL migrations.                                                                                                                                                                                                            |
| **`embedded-postgres` for no-Docker development** | Some machines can't run Docker. Production must use managed PostgreSQL.                                                                                                                                                                             |
| **Next.js `proxy.ts`** (formerly middleware)      | Only a coarse auth gate and headers there. Authorization always happens in core services.                                                                                                                                                           |
| **Camera preview, coding-question execution**     | The camera is a local self-view the company and candidate both opt into (never recorded or analysed). Code execution is off by default: the provider interface exists (`CODE_EXECUTION_PROVIDER=disabled`); sandboxed execution is future work.     |

## Scaling notes

- The web tier is stateless (sessions live in PostgreSQL), so it scales horizontally behind any load balancer.
- Turn latency is dominated by the LLM call. Prompt prefixes are cache-friendly (stable system blocks first), and per-turn calls use low reasoning effort.
- Hot tables are indexed by `(companyId, …)`, `sessionId` and `status`. `rate_limit_bucket` and finished jobs are pruned hourly.
- For very high concurrency, move rate limiting to Redis and run more worker replicas. The queue already supports concurrent workers.
