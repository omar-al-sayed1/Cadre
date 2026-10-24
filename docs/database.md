# Database

PostgreSQL 17 with Prisma 7 (`packages/database`). The schema is in `prisma/schema.prisma`, migrations in `prisma/migrations`, and the generated client in `src/generated/prisma` (not committed; created by `prisma generate` on install).

## Conventions

- **Tenancy:** every business table carries `companyId` directly or through its parent (job → company, session → company). Core services filter by the actor's `companyId` on every query, and cross-tenant access returns `NOT_FOUND` (not `FORBIDDEN`) so IDs can't be probed.
- **IDs:** cuid-style strings (`createId`), never sequential.
- **Soft deletes:** `deletedAt` on user-facing entities (jobs, templates, candidates, sessions). Privacy erasure performs real deletion or anonymisation (see [security](security.md#data-retention-and-deletion)).
- **Secrets:** invitation tokens, candidate session credentials and team-invite tokens are stored only as SHA-256 hashes.
- **JSON columns** (template snapshots, engine state, evaluations, settings) are validated with zod on read and write. Code never trusts their shape.
- **Timestamps** are Prisma `DateTime` (`timestamp(3)`), always written in UTC. Display time zones come from company settings. The database must use UTF-8.

## Model map

```
Identity & tenancy      User ─< CompanyMember >─ Company ─ Plan
                        Company ─< ProductSubscription >─ Plan   (one per product key)
                        Company ─< Agent                          (one per AI employee)
                        AuthSession, AuthAccount, Verification (Better Auth), TeamInvitation

Hiring setup            Company ─< Job ─< JobSkill >─ Skill
                        Job ─< InterviewTemplate ─< InterviewSection ─< InterviewQuestion
                        InterviewTemplate ─< InterviewTemplateVersion (immutable snapshot)
                        Company ─< QuestionBankItem

Candidates              Company ─< Candidate ─< CandidateResume
                        Candidate ─< Application >─ Job        (pipeline stage, rating)
                        Application ─< InterviewInvitation     (token hash, expiry, attempts)

Interviews              InterviewInvitation ─< InterviewSession ─ InterviewTemplateVersion
                        InterviewSession ─< InterviewMessage   (transcript, ordered, idempotent)
                        InterviewSession ─< CandidateAnswer ─ QuestionEvaluation
                        InterviewSession ─ InterviewEvaluation ─< SkillEvaluation
                        InterviewSession ─< Recording, IntegrityEvent, ConsentRecord
                        InterviewSession ─ CandidateFeedback

Review                  RecruiterNote, EvaluationFeedback (reviewer accuracy ratings)

Sales                   Company ─< SalesLead ─< SalesActivity   (timeline; actor USER / AI / SYSTEM)
                        SalesLead ─< SalesLeadResearch           (status, provider, labelled result, sources)
                        SalesLead ─< SalesConversation ─< SalesMessage (drafts, logged messages, analysis)
                        Company ─< SalesSuppression              (opted-out emails and phones)

Operations              AuditLog, Notification, DataDeletionRequest, BackgroundJob,
                        AiUsageEvent, FeatureFlag ─< FeatureFlagOverride, RateLimitBucket
```

## Important tables

| Table                                       | Notes                                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `interview_template_version`                | `snapshot` holds everything a session needs: job, skills, sections, questions with rubrics and ideal answers, AI settings, scoring config. Sessions reference a version, never the mutable template.                     |
| `interview_session`                         | Status (state machine), `engineState` (planner memory), `stateVersion` (optimistic concurrency), turn lock, timing (`startedAt`, `pausedSeconds`), `credentialHash`, prompt and scoring versions.                        |
| `interview_message`                         | Ordered by `sequenceNumber`. `(sessionId, clientMessageId)` is unique, which is what makes answer submission idempotent. Stores the AI action and intent for analysis.                                                   |
| `candidate_answer` / `question_evaluation`  | Per-answer evidence: score, confidence, demonstrated/missing concepts, STAR completeness, candidate facts.                                                                                                               |
| `interview_evaluation` / `skill_evaluation` | Final report. Keeps the AI's `overallScore` and `recommendation` next to any human `overriddenScore` / `overriddenRecommendation` with `overrideReason`, plus `promptVersion`, `scoringVersion` and evidence references. |
| `consent_record`                            | One row per accepted policy, with `policyVersion`, hashed IP and user agent.                                                                                                                                             |
| `background_job`                            | Queue: `status`, `runAt`, `attempts`, `lockedAt`, `uniqueKey` (idempotent enqueue).                                                                                                                                      |
| `ai_usage_event`                            | Operation, model, tokens, estimated cost, latency and success, per company and session.                                                                                                                                  |
| `product_subscription`                      | `(companyId, productKey)` is unique. Status (`TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED`), plan, trial and period dates. A migration gave every existing company an active AI Interviewer subscription.      |
| `sales_lead`                                | Contact and company fields, normalised dedupe keys, status, fit / intent / total score, score breakdown (JSON), band, problem relevance from research, owner, soft delete.                                               |
| `sales_message`                             | Direction, channel, status (`DRAFT`, `APPROVED`, `LOGGED`, `SENT`, `FAILED`, `DISCARDED`), whether AI-generated, and the stored reply analysis. `LOGGED` means sent outside Cadre.                                       |
| `sales_suppression`                         | Normalised email or phone with a reason. Checked before every draft, workspace-wide.                                                                                                                                     |
| `audit_log`                                 | Actor, action, entity and minimal metadata. Never secrets or unnecessary personal data.                                                                                                                                  |

## Migrations

```bash
pnpm db:migrate:create   # create a migration from schema changes (dev)
pnpm db:migrate          # create + apply in development
pnpm db:migrate:deploy   # apply pending migrations (CI / production)
pnpm db:reset            # drop, re-migrate and re-seed the dev database
pnpm db:studio           # browse data
```

Rules:

- Every schema change ships as a reviewed SQL migration. Never `db push` against shared environments.
- Prefer additive changes. Backfill in a separate migration or job, then tighten constraints.
- Destructive changes (dropping columns or tables) need a two-step rollout: stop using the column, deploy, then drop.

## Seed data

`pnpm db:seed` (`packages/core/src/seed`) creates Nova Technologies with admin, recruiter, reviewer and sales users, a platform admin, the _Junior Java Developer_ job, a published AI-generated interview, and three candidates. Two of them complete full interviews through the real engine and evaluation pipeline (demo AI); the third has an unused invitation. It also adds the AI Sales Agent demo (25 leads, 12 conversations); that part is idempotent and is added to an existing Nova workspace on a re-run. The rest of the seed refuses to run twice; use `pnpm db:reset` to start over.

## Test databases

Integration and E2E tests use `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` appended to the database name. They **truncate every table** and refuse to run against a database whose name doesn't end in `_test`.
