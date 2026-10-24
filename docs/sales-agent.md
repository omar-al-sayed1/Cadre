# AI Sales Agent

The AI Sales Agent (product key `sales-agent`) is Cadre's second AI employee. It learns how a company sells, then researches, scores and qualifies leads, drafts outreach, analyses replies and recommends the next step. People stay in charge: by default nothing leaves Cadre without a person reviewing it.

This document covers what is built (phases 1–2 of the specification), how it works and where the code lives. Later phases (connected mailboxes, sequences, CRM and calendar sync, discovery, forecasting, billing) are listed at the end.

## What a workspace gets

| Area                | What it does                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Setup wizard**    | Seven steps: company, offering, ideal customer profile, value proposition, qualification rules, tone, goals. Saved per section; settings and playbook stay editable afterwards.                                                                                |
| **Dashboard**       | Pipeline counts, conversion, today's AI and team activity, top leads, monthly goals and a live activity feed. Every number comes from stored data; nothing is simulated.                                                                                       |
| **Find leads**      | Cadre's own prospecting agent searches open business data and company websites for companies matching the ICP, with every detail sourced. People review before anything becomes a lead (or verified new companies are added automatically in autonomous mode). |
| **Leads**           | Manual entry, CSV import with column mapping, preview and duplicate detection, filters, search, status changes along the sales process, soft delete.                                                                                                           |
| **Lead scoring**    | 0–100 score from eight weighted factors, explained factor by factor, with data confidence and a qualification verdict (qualified / unqualified / needs review).                                                                                                |
| **Research**        | Background research from the lead's own website (when allowed) and the lead record. Every fact is labelled _verified_, _AI inference_ or _unknown_, with its source.                                                                                           |
| **Outreach drafts** | First emails, follow-ups, proposal and post-meeting follow-ups, LinkedIn, WhatsApp and SMS drafts. Stored as drafts for review; personalisation uses only verified facts.                                                                                      |
| **Conversations**   | Log messages exchanged outside Cadre. Inbound replies are analysed: intent, sentiment, objections, questions, requested information, urgency, suggested reply, escalation.                                                                                     |
| **Recommendations** | Deterministic next-best-action rules over the lead's status, research and latest reply (for example _send the requested information_, _propose a call_, _stop outreach_).                                                                                      |
| **Ask Sales AI**    | Copilot scoped to one lead and the company's sales profile: approach, fit, next step, summaries and first drafts.                                                                                                                                              |
| **Playbook**        | Opening style, pricing and discount policy, competitor positioning, meeting and follow-up rules, forbidden claims, escalation rules and objection handling.                                                                                                    |
| **Notifications**   | `SALES_ALERT` notifications for high-intent replies (intent 70+) and replies that need a person.                                                                                                                                                               |

## Platform pieces it builds on

The Sales Agent is a product module on the shared Cadre platform, not a separate app:

- **Product catalog** (`packages/config/src/products.ts`): stable keys (`interviewer`, `sales-agent`, plus coming-soon products), names, icons, routes and default plans. Plans live in the `plan` table (seeded from `PRODUCT_PLAN_DEFAULTS`), so prices are never hard-coded in the UI.
- **Subscriptions and entitlements** (`packages/core/src/services/subscriptions.ts`): one `ProductSubscription` per company and product. Access is granted while the subscription is `ACTIVE`, `TRIALING` (not expired) or `PAST_DUE`. `CANCELED` and `EXPIRED` keep data readable but block new work. Each product allows one 14-day trial per company. Services call `assertEntitled(companyId, productKey)`, so the check can't be skipped by a route.
- **Agent registry** (`packages/core/src/agents/registry.ts`): every AI employee implements `AgentDefinition` (`getCapabilities`, `getConfiguration`, `getUsage`). `checkAgentAccess` combines entitlement, agent status and permissions.
- **Roles**: `SALES_MANAGER` (everything including configuration and delete), `SALES_REP` (work leads, import, use AI), `VIEWER` (read-only). Company admins have every permission. Permissions: `sales.read`, `sales.write`, `sales.delete`, `sales.import`, `sales.export`, `sales.configure`, `sales.ai`.
- **Marketplace and home** (`/marketplace`, `/home`): product cards, trials and per-product navigation driven by the workspace's subscriptions.

## Code map

```
packages/sales-engine/       Pure logic, no I/O
  normalize.ts               names, emails, phones, domains, company suffixes
  dedupe.ts                  duplicate keys (email, phone, person+company, person+domain, company domain)
  state-machine.ts           human and AI transition tables
  scoring.ts                 weighted, coverage-aware lead scoring and qualification
  import.ts                  CSV column mapping and row validation
  recommendations.ts         next-best-action rules
packages/ai/src/sales/       SalesAI interface, prompts, schemas, LLM and demo implementations
packages/validation/src/sales.ts   config sections, lead, import, copilot and message schemas
packages/core/src/services/sales/
  access.ts                  entitlement + permission + AI quota checks
  agent.ts                   configuration (per-section updates, onboarding state, pause/resume)
  leads.ts, import.ts        lead CRUD, status changes, scoring columns, CSV import
  research.ts, research-providers.ts   background research and the SSRF-safe website reader
  messaging.ts               drafts, manual sending, logged messages, reply analysis consequences
  automation.ts              AI status changes, suppression list
  context.ts                 what the AI sees about the business and the lead; recommendations
  copilot.ts, dashboard.ts, activity.ts
  engine.ts                  SalesAgentEngine facade over the services above
apps/web/src/app/(app)/sales/      dashboard, leads, lead detail, setup, settings, playbook
apps/web/src/app/api/sales/        API routes (each calls one core service)
```

## Lead scoring

Eight factors with configurable weights (defaults in brackets): industry fit (20), location (10), role relevance (15), company size (10), qualification rules (15), problem relevance from research (10), buying intent from replies (10) and engagement from the pipeline stage (10).

Each factor is **scored**, **unknown** (relevant but missing data) or **not applicable** (for example, no research yet). The weighted average of scored factors is pulled toward a cautious prior of 40 in proportion to how much relevant data is missing, so a lead with one matching field can't score 100. Data confidence is shown next to the score.

Qualification uses the company's strictness (lenient 50, balanced 60, strict 75). A hard mismatch (industry, location or size scoring 20 or less) always produces _needs review_ instead of _qualified_, even when other factors are strong. Bands: Hot ≥ 90, High ≥ 70, Medium ≥ 50, Low ≥ 30, otherwise Very low (configurable).

## Lead status and who may change it

`NEW → RESEARCHING → QUALIFIED / UNQUALIFIED → CONTACTED → ENGAGED → INTERESTED → MEETING_REQUESTED → MEETING_BOOKED → PROPOSAL → NEGOTIATION → WON / LOST`, plus `DO_NOT_CONTACT`.

People and the AI use separate transition tables (`HUMAN_TRANSITIONS`, `AI_TRANSITIONS`). The AI only moves leads forward along evidence it has (for example a meeting request moves an engaged lead to _meeting requested_). It never closes deals, never reopens a lost or opted-out lead, and anyone can move a lead to `DO_NOT_CONTACT`, which is terminal.

## Research

`requestLeadResearch` queues `sales.research-lead` (idempotent while a run is in progress, rate limited, counted against the AI quota). The job:

1. gathers sources through a `ResearchProvider` selected by `RESEARCH_PROVIDER`:
   - `website` (default) reads up to two pages of the lead's **own** website (`/`, `/about`, `/about-us`). It honours `robots.txt`, identifies itself as `CadreResearchBot`, and blocks private, loopback, link-local and metadata addresses at connect time (DNS-rebinding safe). Limits: 512 KB per page, 8-second timeout, 3 redirects, each re-validated.
   - `none` uses only the lead record.
2. asks the AI for a structured `leadResearchSchema` result: company facts, potential problems and needs, opportunity, problem relevance, unknowns. Every fact carries a basis (`VERIFIED`, `INFERENCE`, `UNKNOWN`) and a source.
3. stores the result, rescores the lead with the new problem relevance, and lets the AI qualify or disqualify a `NEW` lead only when data confidence is at least 75% and the verdict isn't _needs review_.

Research never overwrites the lead's own fields and never invents people, numbers or contact details. Failures are recorded as `FAILED` with a plain-language reason, and the timeline says research was unavailable.

There is no scraping of search engines, LinkedIn or other third-party sites.

## Find leads: the prospecting agent

"Find leads" (`/sales/discover`) runs Cadre's own research agent (`packages/core/src/services/sales/prospecting`). It needs no search API and never scrapes search engines (that would break their terms); it works from open, permitted sources and the companies' own public websites:

| Step      | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Plan   | The AI (or built-in rules) turns the ICP into OpenStreetMap categories, multilingual business-name words ("Realty", "Immobilier", "عقارات"), Wikidata industries, and directory / association member-list pages worth reading.                                                                                                                                                                                                                                         |
| 2. Gather | **OpenStreetMap** via Overpass (categories + name matches inside the countries / cities; city → country widening when results are few; mirror failover; Nominatim fallback restricted by ISO country), **Wikidata** (industry and company-type matches with websites and size), and **directory pages**: the AI reads each page, extracts the companies it lists (websites only if really linked) and picks pagination / member-list links to follow on the same site. |
| 3. Merge  | One candidate per company (by domain, then name), combining sources. Companies already in the CRM are skipped.                                                                                                                                                                                                                                                                                                                                                         |
| 4. Visit  | Each company's own website: homepage plus contact / about / team pages (robots.txt honoured, identified user agent, SSRF-safe, a few pages per site). Extracts published emails (role mailboxes on the company's domain first), `tel:` numbers and the LinkedIn company page it links to.                                                                                                                                                                              |
| 5. Assess | The AI judges fit against the ICP from that evidence and names leaders only when they appear on the fetched pages (the platform drops any person whose source page wasn't fetched). Without a model, keyword rules decide.                                                                                                                                                                                                                                             |
| 6. Rank   | Best-evidenced matches first (confidence, verified website, email, phone, named people).                                                                                                                                                                                                                                                                                                                                                                               |

Runs are background jobs (`sales.discover-leads`) with live progress, **quick** or **deep** budgets, and a notification when done. Every result shows where each detail came from (OpenStreetMap / Wikidata record, directory page, the exact page an email or phone was found on). Open data is attributed (© OpenStreetMap contributors, ODbL; Wikidata, CC0).

**The AI brain.** Any configured model works: Claude (`AI_PROVIDER=anthropic`), any OpenAI-compatible endpoint, or a **free local model** with Ollama (`AI_PROVIDER=ollama`, `DEMO_MODE=false`, e.g. `ollama pull qwen2.5:7b-instruct`). With no model, the agent still returns real companies from open data, using keyword rules (no directory reading, no named people).

**Coverage.** Open data varies by country and industry — OpenStreetMap is rich for shops, clinics, hotels and offices in many cities and thin elsewhere; public Overpass servers are sometimes overloaded (the agent fails over and falls back, and says so). Reading directories with an AI model adds the most recall. Optionally, `DISCOVERY_CLAUDE_WEB_SEARCH=true` adds Claude's web search as one more source (Anthropic provider only; every suggestion still goes through the website visit and assessment).

Settings: `DISCOVERY_PROVIDER=agent|samples|off` (samples = fictional demo data for tests), `OVERPASS_URL` (comma-separated mirrors), `WIKIDATA_SPARQL_URL`. Try it from the command line: `pnpm --filter @repo/core smoke:prospecting "Dental clinic" Jordan Amman`.

## Drafts and sending

`generateOutreachDraft` refuses opted-out and suppressed contacts, then asks the AI for an `outreachDraftSchema` result: subject, body, personalisation sources and warnings. Drafts are flagged when they contain a playbook _forbidden claim_.

Drafts are stored with status `DRAFT` and are **never sent by Cadre** in this phase. The lead page says so and offers _Copy_ and _I sent it_. _I sent it_ records the message as `LOGGED` and the timeline reads "sent … (outside Cadre)", so analytics never claim an email Cadre didn't send. The dashboard shows "Emails sent by Cadre — needs a connected mailbox" until phase 3.

## Reply analysis and its consequences

Logging an inbound message runs `analyzeConversation` (`conversationAnalysisSchema`). The platform, not the model, applies the result (`applyReplyAnalysis`):

| Intent                               | What happens                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `UNSUBSCRIBE`                        | Lead → `DO_NOT_CONTACT`, email and phone added to the suppression list, pending drafts discarded      |
| `MEETING_REQUEST`                    | Lead → _meeting requested_ (forward only), team alerted                                               |
| `INTERESTED`, `PRICE_REQUEST`        | Lead → _interested_ (forward only), team alerted; pricing requests recommend sending the information  |
| `QUESTION`, `OBJECTION`, `LATER`     | Lead → _engaged_ (forward only); recommendation to answer, handle the objection or wait               |
| `OUT_OF_OFFICE`, `NOT_INTERESTED`, … | Intent score and lead score updated; no status change                                                 |
| Escalation flag                      | Team alerted that a person should reply (legal, contract, security, angry or low-confidence messages) |

Suppression is checked by email and phone across the workspace, so re-adding the same person as a new lead can't restart outreach.

## AI safety rules specific to sales

- Prospect content (websites, replies, imported fields) is wrapped as untrusted data; instructions inside it are ignored and reported (see [AI prompts](ai-prompts.md#untrusted-input-and-prompt-injection)).
- The model returns structured output only. Every result is validated with zod before any business logic runs, and only core services change data. The model cannot call tools that mutate the database.
- The model never reveals system prompts, scoring internals, credentials or other customers' data, never claims to be human when asked, and discloses automation when the workspace enables it.
- No pressure tactics, no invented urgency or discounts beyond the discount policy, and pricing and contract terms are escalated to a person.
- Demo mode (`DEMO_MODE=true`) uses deterministic implementations (`demo-sales-ai.ts`, `demo-sales-core.ts`) that follow the same rules and never fabricate facts.

## API

All routes derive the company from the session; an `organizationId` in a request body is ignored.

| Route                                          | Purpose                                 |
| ---------------------------------------------- | --------------------------------------- |
| `GET/POST /api/sales/leads`                    | List with filters / create              |
| `GET/PATCH/DELETE /api/sales/leads/[id]`       | Read, update, soft delete               |
| `POST /api/sales/leads/[id]/status`            | Change status (state machine enforced)  |
| `POST /api/sales/leads/[id]/score`             | Rescore now                             |
| `POST /api/sales/leads/[id]/research`          | Queue research                          |
| `POST /api/sales/leads/[id]/drafts`            | Generate an AI draft                    |
| `GET/POST /api/sales/leads/[id]/conversations` | List conversations / log a message      |
| `POST /api/sales/leads/[id]/copilot`           | Ask Sales AI about a lead               |
| `POST /api/sales/leads/import`                 | CSV import (preview and commit)         |
| `PATCH /api/sales/messages/[id]`               | Edit, approve or discard a draft        |
| `POST /api/sales/messages/[id]/sent`           | Record a draft as sent outside Cadre    |
| `GET/PATCH /api/sales/settings`                | Read / update one configuration section |
| `POST /api/sales/agent/status`                 | Pause or resume the agent               |
| `GET /api/sales/activity`                      | Activity feed                           |
| `POST /api/products/[key]/trial`, `/cancel`    | Start a trial / cancel a subscription   |

## Demo data

`pnpm db:seed` adds to Nova Technologies: an active Sales Agent subscription (Pro), a full configuration and playbook, 25 leads across every stage, 12 conversations with analysed replies (pricing request, meeting requests, objection, out-of-office, opt-out, contract request) and the users `sales@nova.test` (sales manager) and `rep@nova.test` (sales rep). The password is `SEED_USER_PASSWORD`. The seed is idempotent on an existing Nova workspace.

## Tests

- `packages/sales-engine/src/*.test.ts`: normalisation, dedupe, state machine, scoring (sparse data, hard mismatches, bands), import mapping, recommendations.
- `packages/ai/src/sales/sales-ai.test.ts`: reply analysis scenarios from the specification (pricing, opt-out, objections, escalation, injection), research without fabrication, outreach from verified facts only.
- `packages/core/src/services/sales/*.integration.test.ts`: entitlements and trials, permissions per role, **cross-tenant isolation** for leads, research and conversations, import, research → score → AI qualification, drafts are never marked sent, opt-out → suppression → no further drafts.
- `research-providers.test.ts`: SSRF address blocking, URL rules, robots.txt, page extraction, user-safe fetch errors.

## Roadmap (later phases)

| Phase | Scope                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------- |
| 3     | Connected mailboxes (Gmail / Microsoft OAuth, encrypted tokens), real sending, inbound sync, approval centre, bounces |
| 4     | Sequences and follow-ups with limits, quiet hours and suppression enforcement, campaign rate limits                   |
| 5     | CRM (HubSpot first) and calendar providers behind interfaces, meeting booking with explicit permission                |
| 6     | Licensed B2B data providers as extra discovery sources, forecasting, deals and pipeline board, A/B testing            |
| 7     | Marketplace billing and self-serve plan changes                                                                       |
