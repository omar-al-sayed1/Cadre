# Cadre

**Build your AI workforce.** Cadre is a multi-product SaaS platform of AI employees. Each one shares a single workspace, team, subscription system and AI layer. Companies start a 14-day trial of any AI employee from the AI Marketplace, then subscribe only to the ones they need.

| AI employee                                 | Status      | What it does                                                                                                  |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| **AI Interviewer** (`interviewer`)          | Available   | Structured first-round interviews by voice or text, with evidence-based evaluations                           |
| **AI Sales Agent** (`sales-agent`)          | Available   | Finds and researches leads, scores and qualifies them, drafts outreach, analyses replies, suggests next steps |
| AI Customer Support, Phone and Email agents | Coming soon | Listed in the marketplace, built on the same platform modules                                                 |

AI output in Cadre is **decision support**. People make the hiring and sales decisions, and the product is built so that they can see the evidence behind every suggestion.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Security and privacy](#security-and-privacy)
- [Deployment](#deployment)
- [Documentation](#documentation)

## Features

### Platform

- **AI Marketplace** with a product catalogue, per-product subscriptions and 14-day trials. Entitlements are enforced in the service layer, not just the UI.
- **One workspace, many AI employees.** Navigation, settings and dashboards adapt to what the company subscribes to. Interviewer settings appear only with the AI Interviewer, sales settings only with the AI Sales Agent.
- **Teams and roles**: admin, recruiter, hiring manager, reviewer, sales manager, sales rep and viewer. Team invitations survive sign-up, so a new user lands back on the invitation after registering.
- **Operations**: Postgres-backed job queue and worker, rate limiting, feature flags, plan limits, AI cost and usage tracking, notifications, audit log, retention and deletion requests, and a platform admin panel.
- **Demo mode** (`DEMO_MODE=true`) runs the whole product with deterministic stand-ins for every paid API (LLM, speech-to-text, text-to-speech). No keys needed.

### AI Interviewer

- **Jobs and rubrics**: weighted skill rubrics, candidates added manually, by CSV import or by résumé upload and parsing.
- **Interview builder**: AI generation from the job description, a five-step editor (structure, questions, AI behaviour, candidate experience, review), a question bank and immutable published versions.
- **Candidate experience**: branded landing page, explicit versioned consent, microphone and speaker check, then the interview room. It has a live AI interviewer ("Ava") shown as an animated orb, caption-style questions, section progress, a timer, press-Space-to-talk, barge-in, a live transcript, an optional camera preview, and reconnect without losing progress.
- **Interview engine**: a deterministic planner decides _what_ happens next (coverage, follow-up budget, difficulty, time). The LLM decides _how to say it_ and evaluates each answer, inside guardrails that block leaks and prompt injection.
- **Evaluation and review**: per-answer evaluations, deterministic score aggregation with evidence-based confidence, a report with transcript and evidence, audited human overrides, and side-by-side candidate comparison.

### AI Sales Agent

- **Setup wizard and playbook**: the agent learns what the company sells, its ideal customer, qualification rules, tone and playbook.
- **Find leads**: a built-in prospecting agent that plans a search, then gathers companies from OpenStreetMap, Wikidata and public business directories. It visits each company's own website for published contact details, and has an AI judge the fit. Users pick a place and radius on a map. There is no search API and no scraping of search engines, and every detail is sourced.
- **Leads**: pipeline view (list or board), CSV import with dedupe, and explainable lead scoring with factor breakdowns. Lead pages show pipeline progress, next best action, conversations, research and a timeline.
- **Research**: reads the lead's own website, respecting `robots.txt` and protected against SSRF. Every fact is labelled as verified or inferred.
- **Outreach and replies**: drafts for human review, conversation analysis, recommendations, and an "Ask Sales AI" copilot scoped to the lead.
- **Safety**: approval mode by default. The agent never invents prospect facts, never pretends an email was sent, and honours opt-outs across the workspace.

## Tech stack

| Area            | Choice                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| Monorepo        | pnpm 12 workspaces, TypeScript 6                                          |
| Web             | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, Radix UI    |
| Data            | PostgreSQL 17+, Prisma 7, Zod 4                                           |
| Auth            | Better Auth (email and password, optional Google)                         |
| AI              | Anthropic Claude, any OpenAI-compatible API, or a local model with Ollama |
| Voice           | Browser speech APIs, OpenAI, Deepgram or ElevenLabs                       |
| Maps            | Leaflet with OpenStreetMap tiles                                          |
| Tests           | Vitest (unit and integration), Playwright (end-to-end)                    |
| Background jobs | Postgres job queue, inline in dev or as a separate worker                 |

## Quick start

**Requirements:** Node.js 22.12+ (24 recommended, see `.nvmrc`), pnpm 12 (`corepack enable`), and PostgreSQL, either via Docker or the bundled no-Docker helper. Use Chrome or Edge for the candidate voice experience.

```bash
pnpm install
cp .env.example .env
```

Edit `.env`:

- `AUTH_SECRET`: generate one with `openssl rand -base64 48`.
- `DATABASE_URL`: pick the line for your database option (both are listed in `.env.example`).
- Keep `DEMO_MODE=true` to run without any API keys.

Start PostgreSQL with **one** of these:

```bash
docker compose up -d postgres   # PostgreSQL 17 on :5432
pnpm dev:db                     # no Docker: embedded PostgreSQL on :54329, data in .data/postgres
```

Keep `pnpm dev:db` running in its own terminal. Both options also create the `interviewer_test` database used by tests.

Then create the schema and start the app:

```bash
pnpm db:migrate:deploy
pnpm db:seed    # optional demo data
pnpm dev        # http://localhost:3000
```

Emails print to the server console (`EMAIL_PROVIDER=console`), including verification and invitation links.

## Configuration

All settings live in `.env`; `.env.example` documents every variable. The main groups:

| Setting                                                | Purpose                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `DEMO_MODE`                                            | `true` replaces every paid provider with deterministic local versions                                          |
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` | The LLM: `anthropic`, `openai` (or any compatible gateway), `ollama` or `mock`                                 |
| `AI_FAST_MODEL`                                        | Optional cheaper, faster model for the per-turn interviewer loop                                               |
| `SALES_AI_PROVIDER`, `SALES_AI_MODEL`, …               | Optional separate model for the Sales Agent, for example a free local Ollama model while interviews use Claude |
| `STT_PROVIDER`, `TTS_PROVIDER`                         | Speech: `browser` (free, in the candidate's browser), `openai`, `deepgram`, `elevenlabs` or `mock`             |
| `DISCOVERY_PROVIDER`                                   | Find leads: `agent` (the prospecting agent), `samples` (fictional demo data) or `off`                          |
| `DISCOVERY_CLAUDE_WEB_SEARCH`                          | Also let Claude's web search suggest companies (Anthropic only)                                                |
| `OVERPASS_URL`, `WIKIDATA_SPARQL_URL`                  | Open-data endpoints for Find leads. `OVERPASS_URL` takes a comma-separated list of mirrors.                    |
| `RESEARCH_PROVIDER`                                    | `website` (read the lead's own site) or `none`                                                                 |
| `STORAGE_PROVIDER`                                     | `local`, `s3`, `r2` or `supabase`                                                                              |
| `EMAIL_PROVIDER`                                       | `console`, `resend` or `smtp`                                                                                  |
| `QUEUE_INLINE_WORKER`                                  | `true` runs background jobs inside the web process (dev). Use `false` plus the worker in production.           |

API keys belong in `.env` only. They are read on the server and never sent to the browser.

**Free local AI (Windows).** `pnpm setup:local-ai` installs [Ollama](https://ollama.com), pulls a small model, checks that it answers and points the Sales Agent at it (`SALES_AI_PROVIDER=ollama`). Interviews keep their own model.

**Branding.** The name, colours and copy live in `packages/config/src/brand.ts` (or set `APP_NAME`). Products and default plans live in `packages/config/src/products.ts`.

## Scripts

| Command                                   | What it does                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`                                | Web app on :3000 (runs background jobs inline when `QUEUE_INLINE_WORKER=true`) |
| `pnpm dev:worker`                         | Standalone background worker                                                   |
| `pnpm dev:db`                             | Embedded PostgreSQL on :54329, without Docker                                  |
| `pnpm build` / `pnpm start`               | Production build and server for the web app                                    |
| `pnpm start:worker`                       | Production worker                                                              |
| `pnpm typecheck`                          | `tsc --noEmit` in every package                                                |
| `pnpm lint` / `pnpm lint:fix`             | ESLint (zero warnings allowed)                                                 |
| `pnpm format` / `pnpm format:check`       | Prettier                                                                       |
| `pnpm test`                               | Unit and integration tests                                                     |
| `pnpm test:integration`                   | Integration tests only                                                         |
| `pnpm test:e2e`                           | Playwright end-to-end tests                                                    |
| `pnpm check`                              | typecheck, lint, test, then build                                              |
| `pnpm db:migrate` / `db:migrate:deploy`   | Create and apply migrations (dev) / apply migrations (CI and production)       |
| `pnpm db:seed` / `db:reset` / `db:studio` | Demo data / reset the database / Prisma Studio                                 |
| `pnpm setup:local-ai`                     | Install Ollama and a local model for the Sales Agent (Windows)                 |

## Testing

- **Unit tests** cover the pure packages: interview engine, scoring, sales engine, validation and prospecting.
- **Integration tests** run domain services against a real PostgreSQL database. They use `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` added to the database name, and **truncate every table**, so the name must end in `_test`. They never touch your dev data.
- **End-to-end tests** (Playwright on Microsoft Edge) build and serve the app on :3100 against the test database. They cover two journeys:
  - A recruiter creates a job and an AI-generated interview, a candidate completes it (with the camera on), and the recruiter reviews the report and compares candidates.
  - A new user registers from a team invitation and returns to accept it.

Run everything before a release with `pnpm check`, then `pnpm test:e2e`.

## Project structure

```
apps/
  web/                Next.js app: marketplace, interviewer and sales workspaces,
                      candidate interview room, admin panel, API routes
  worker/             Background job worker for production
packages/
  config/             Brand, environment schema, product catalogue, plans, limits, feature flags
  shared/             Errors, logger with secret redaction, crypto, shared types
  validation/         Zod schemas shared by client and server
  database/           Prisma schema, migrations and client
  core/               Domain services: the only layer with business logic that touches the database
  ai/                 LLM providers, versioned prompts, output schemas, demo AI
  interview-engine/   Planner, state machines, memory, adaptive difficulty, guardrails
  scoring/            Deterministic score aggregation and recommendation rules
  sales-engine/       Lead normalisation, dedupe, pipeline states, scoring, import, recommendations
  voice/              Speech-to-text and text-to-speech providers
  storage/            Local, S3, R2 and Supabase file storage with upload validation
  email/              Email providers and templates
  queue/              Postgres job queue and worker runtime
  ui/                 Design-system components (Radix UI and Tailwind CSS)
docs/                 Architecture and operations documentation
scripts/              Local database and local AI helpers
```

## Architecture

```
Browser ──► Next.js (pages and API routes) ──► core services ──► PostgreSQL
                                                    │
                     engines (interview, scoring, sales) · AI providers · queue
```

- **Layers.** Pages and API routes authenticate the user and validate input, then call `@repo/core`. Core services check permissions and entitlements, scope every query to the user's workspace, and write an audit entry. The engine packages are pure logic with no database access.
- **Multi-tenancy.** The workspace always comes from the signed-in session, never from the browser. Every query is scoped to it, so one company can never see another's data.
- **AI boundaries.** Models produce structured, schema-validated output. Code decides what is saved and what happens next; a model never changes the database directly.
- **Background work.** Evaluations, emails, reminders and clean-up run as idempotent jobs in a Postgres queue.

See [docs/architecture.md](docs/architecture.md) for request flows and design decisions.

## Security and privacy

- Passwords are hashed and secrets are never logged. Invitation tokens are stored only as hashes, and candidate sessions use signed credentials.
- API keys and OAuth tokens stay on the server and are never returned to the browser.
- Content Security Policy, rate limiting on public endpoints, upload validation, and SSRF protection for every outbound fetch.
- Consent is versioned and recorded before an interview starts. Audio is not stored, only the transcript. Data retention and deletion requests are built in.
- Sales research uses only permitted, public sources. It respects `robots.txt`, labels inferred facts, and stops all outreach to anyone who opts out.
- Interview scores never use protected characteristics, accent or appearance. Integrity signals are shown to reviewers as context, never as accusations. Every human override is recorded with a reason.

Details: [docs/security.md](docs/security.md).

## Deployment

1. Provision PostgreSQL and set the production environment variables (`DEMO_MODE=false`, real `AUTH_SECRET`, `APP_URL`, provider keys).
2. Apply migrations: `pnpm db:migrate:deploy`.
3. Build and start the web app: `pnpm build && pnpm start`.
4. Run the worker as its own process with `pnpm start:worker`, and set `QUEUE_INLINE_WORKER=false` for the web app.

## Documentation

- [Architecture](docs/architecture.md): system design, request flows, decisions and assumptions
- [AI Sales Agent](docs/sales-agent.md): setup, Find leads, scoring, research, drafts, reply analysis, safety rules, API
- [Interview engine](docs/interview-engine.md): planner, follow-ups, adaptive difficulty, timing, failure handling
- [AI prompts](docs/ai-prompts.md): prompt inventory, versioning, structured output, injection defences
- [Database](docs/database.md): data model, tenancy, migrations
- [Security and privacy](docs/security.md): threat model, controls, data handling
- [Local development](docs/local-development.md): setup, real providers, testing, troubleshooting
