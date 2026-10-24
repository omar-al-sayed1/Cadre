# Local development

## Prerequisites

- Node.js **22.12+** (24 recommended, see `.nvmrc`)
- pnpm **12** — `corepack enable` picks up the version pinned in `package.json`
- PostgreSQL **17**: Docker (`docker compose`), a local install, or the bundled no-Docker helper
- Microsoft Edge or Chrome for the candidate voice experience (browser speech recognition)

## First run

```bash
pnpm install                       # also runs `prisma generate`
cp .env.example .env
```

Edit `.env`:

- `AUTH_SECRET`: `openssl rand -base64 48`
- `DATABASE_URL`: the line for your database option (both are listed in `.env.example`)
- keep `DEMO_MODE=true` to run without any API keys

Start PostgreSQL. **Either:**

```bash
docker compose up -d postgres      # :5432, also creates interviewer_test
```

**or, without Docker:**

```bash
pnpm dev:db                        # embedded PostgreSQL on :54329, data in .data/postgres
```

`pnpm dev:db` downloads nothing at runtime (binaries come from the `embedded-postgres` npm package), forces UTF-8 regardless of the OS locale, and creates `interviewer` and `interviewer_test`. Keep it running in its own terminal.

Then:

```bash
pnpm db:migrate:deploy
pnpm db:seed                       # optional demo data
pnpm dev                           # http://localhost:3000
```

With `QUEUE_INLINE_WORKER=true` (the default in `.env.example`), the dev server also processes background jobs: evaluations, emails, reminders. To run the worker separately, as in production, set it to `false` and run `pnpm dev:worker`.

Emails print to the server console (`EMAIL_PROVIDER=console`). Verification and invitation links show up there.

## Demo walkthrough

1. Register at `/register` (or sign in as `recruiter@nova.test` after seeding).
2. Onboarding: create a company, then a job with skills (for example Java, Spring Boot, REST API, SQL, Git) and **Balance weights**.
3. **Generate interview with AI** → review the steps → **Publish interview**.
4. Invite a candidate and copy the link. Open it in a private window to play the candidate.
5. Accept the consents, test your microphone (or **Continue with text**), **Begin interview**.
6. When the interview ends, the evaluation appears under **Interviews** within seconds. Open the report, then **Compare** once two candidates are done.

## Using real providers

Set `DEMO_MODE=false`, then configure:

| Concern                  | Variables                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| LLM (Anthropic, default) | `AI_PROVIDER=anthropic`, `AI_API_KEY`, optional `AI_MODEL` (default `claude-opus-5-5`), `AI_FAST_MODEL` |
| LLM (OpenAI-compatible)  | `AI_PROVIDER=openai`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`                                           |
| Speech-to-text           | `STT_PROVIDER=openai\|deepgram`, `STT_API_KEY`, optional `STT_MODEL` (default `browser`)                |
| Text-to-speech           | `TTS_PROVIDER=openai\|elevenlabs`, `TTS_API_KEY`, optional `TTS_MODEL` (default `browser`)              |
| Storage                  | `STORAGE_PROVIDER=s3\|r2\|supabase` plus `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, keys                     |
| Email                    | `EMAIL_PROVIDER=resend` + `EMAIL_API_KEY`, or `smtp` + `SMTP_URL`; `EMAIL_FROM`                         |
| Google sign-in           | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                              |

Every variable is validated at startup (`packages/config/src/env.ts`); a missing key for a selected provider fails fast with a clear message. AI usage and estimated cost are tracked per company (**Settings → Plan & usage**).

## Quality gates

```bash
pnpm typecheck         # all packages
pnpm lint              # ESLint, zero warnings
pnpm test              # unit + integration (integration needs PostgreSQL)
pnpm test:integration  # integration only
pnpm test:e2e          # Playwright MVP flow (Edge), builds & serves on :3100
pnpm build             # production build
pnpm check             # typecheck → lint → test → build
```

- **Unit tests** live next to the code (`*.test.ts`): engine, planner, state machines, scoring, AI heuristics and schemas.
- **Integration tests** (`*.integration.test.ts`, `packages/core`) run the real services against `<db>_test`: invitations, consent, session auth, idempotency, prompt injection, full interviews, evaluation, overrides, tenant isolation. The database is truncated before each test.
- **E2E** (`apps/web/e2e`) drives the whole MVP scenario in a real browser: register → company → job → AI interview → publish → invite two candidates → both interview by text → report → compare. It uses the system Edge (`E2E_BROWSER_CHANNEL=chrome` to switch) and the `_test` database. Set `E2E_BASE_URL` to test an already-running server instead.

Useful dev scripts:

```bash
# Print a simulated interview transcript from the engine (strong or weak candidate)
pnpm --filter @repo/core exec tsx ../interview-engine/scripts/transcript.ts weak
```

## Troubleshooting

| Symptom                                                    | Fix                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL is required` / connection refused            | Start PostgreSQL (`pnpm dev:db` or Docker) and check the port in `DATABASE_URL`.                                                    |
| `invalid byte sequence for encoding` during seed           | The cluster was created with a non-UTF-8 locale. Stop `dev:db`, delete `.data/postgres`, start again (the helper now forces UTF-8). |
| Seed says data already exists                              | `pnpm db:reset` recreates the dev database and re-seeds.                                                                            |
| Microphone blocked                                         | Allow the site in browser settings; candidates can always continue by typing.                                                       |
| Voice option disabled                                      | The browser has no speech recognition (e.g. Firefox). Use Chrome, Edge or Safari, configure server STT, or type.                    |
| Evaluation never appears                                   | Background jobs aren't running: set `QUEUE_INLINE_WORKER=true` or run `pnpm dev:worker`.                                            |
| `next build` prerender errors such as `useContext` of null | `NODE_ENV` is set to `development` in the environment. Don't set `NODE_ENV` in `.env`; Next.js manages it.                          |
