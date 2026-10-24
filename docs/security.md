# Security & privacy

The platform processes sensitive applicant data (identity, voice, résumés, assessments) and spends money on paid AI APIs. This document covers the threat model, the controls in place, and operating guidance.

## Threat model (summary)

| Threat                                                        | Main controls                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guessing or leaking interview links                           | 256-bit random tokens, SHA-256 hashes only in the DB, rotation on resend, expiry and attempt limits, rate-limited lookup                                                                                                                             |
| Hijacking a candidate session                                 | Per-session credential in an `httpOnly`, `SameSite=Strict` cookie (hash stored server-side), rotated whenever the link is reopened, so the previous device is signed out                                                                             |
| Cross-tenant data access                                      | Every service query is scoped by `companyId`; foreign IDs return `NOT_FOUND`; integration tests cover cross-company access                                                                                                                           |
| Privilege escalation inside a company                         | RBAC checked inside core services (`requirePermission`), not only in the UI                                                                                                                                                                          |
| Prompt injection via answers, résumés or job text             | Untrusted text wrapped as data with tag neutralisation, injection detection, a planner-constrained action space, and output guards (see [AI prompts](ai-prompts.md#untrusted-input-and-prompt-injection))                                            |
| Leaking hidden rubrics, ideal answers or scores to candidates | Allow-listed candidate view model, spoken-text guard, tests asserting no internal fields reach the browser                                                                                                                                           |
| CSRF on API routes                                            | `SameSite` cookies, plus an Origin/Referer check on every state-changing API request                                                                                                                                                                 |
| XSS                                                           | React escaping, strict CSP, no `dangerouslySetInnerHTML` except the static theme script, uploaded files served with safe content types                                                                                                               |
| Malicious uploads                                             | Size limits, extension and MIME allow-lists, magic-byte sniffing, randomised storage keys, sanitised file names                                                                                                                                      |
| Abuse and cost attacks on AI endpoints                        | Per-route DB-backed rate limits, plan quotas (interviews per month, AI budget), usage tracking per company                                                                                                                                           |
| Server-side request forgery through lead research             | Only the lead's own http(s) site on standard ports; private, loopback, link-local and metadata addresses blocked when DNS resolves; redirects re-validated; size and time caps; robots.txt honoured; raw network errors never shown to users         |
| Prospecting agent misuse of the web                           | Only open data (OpenStreetMap, Wikidata) and public pages; never search engines, social networks or logins; robots.txt honoured; identified user agent; a few pages per site; per-host spacing for open-data APIs; same SSRF protections as research |
| Contacting people who opted out                               | Opt-out replies move the lead to do-not-contact, add the email and phone to a workspace suppression list, and discard pending drafts. Drafting checks the list every time                                                                            |
| Using a product without a subscription                        | Entitlements checked in core services (`assertEntitled`), not only in navigation; the organisation always comes from the session                                                                                                                     |
| Secrets exposure                                              | Env validated server-side only; no secrets in client bundles; log redaction of tokens, passwords, keys and candidate content                                                                                                                         |

## Authentication & authorization

- **Recruiters** use Better Auth: email/password (scrypt hashing) with email verification and password reset, or optional Google sign-in. Sessions are database-backed with an `aii` cookie prefix. Sign-in and registration are rate limited.
- **Candidates** never get accounts. They authenticate with the invitation token, then a per-session credential cookie.
- **Roles** (per company): Admin, Recruiter, Hiring manager, Reviewer, Sales manager, Sales rep, Viewer. Platform `SUPER_ADMIN` is separate; `/admin` returns 404 to everyone else. The admin panel shows only company metadata, usage, feature flags and job health. It has no route to candidate data or interviews, and every admin change (flags, plans, job retries) is audited.

## Security headers

Set in `apps/web/next.config.ts` for every response:

- `Content-Security-Policy`: `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `connect-src 'self'`, `upgrade-insecure-requests` in production
- `Strict-Transport-Security` (production), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`
- `Permissions-Policy`: microphone and camera for this origin only; geolocation, payment and USB disabled

`script-src` allows `'unsafe-inline'` because Next.js App Router streams inline bootstrap scripts. Moving to nonce-based CSP is listed under hardening.

## Rate limits

DB-backed fixed windows (`rate_limit_bucket`), keyed by IP hash, user or session as appropriate:

| Limit                                               | Max / window                        |
| --------------------------------------------------- | ----------------------------------- |
| Login / registration / password reset               | 10/min · 5 per 5 min · 5 per 15 min |
| Invitation token lookup                             | 30/min                              |
| Candidate messages / audio / TTS / integrity events | 30/min · 30/min · 60/min · 120/min  |
| AI generation (recruiter)                           | 20 per 5 min                        |
| File uploads                                        | 30 per 5 min                        |
| Invitations sent                                    | 100/hour                            |

## Logging

`packages/shared/src/logger.ts` emits structured JSON. It redacts sensitive keys recursively (passwords, tokens, credentials, API keys, authorization headers, cookies, answer content, résumé text) and truncates large values. Request IDs tie logs to API responses. Error responses expose only a stable code and a user-safe message; stack traces stay in server logs.

## Privacy

### Consent and transparency

Before an interview the candidate sees how it works: an AI interviews them, answers are transcribed, whether audio is recorded, that people make the decision, what isn't assessed, and the retention policy. They accept versioned consents (`consent_record` stores policy version, time, hashed IP and user agent). Recording requires its own explicit consent when enabled.

### Fairness

- No protected characteristics are collected, inferred or scored. Accent, appearance and personal circumstances are explicitly excluded from evaluation.
- Analytics are aggregate only, and no demographic data is collected.
- Integrity signals (tab switches, long pauses, multiple sessions) are shown to reviewers as neutral context with no automated penalty.
- Every score is shown with confidence and evidence, behind a disclaimer that the evaluation is AI-generated and needs human review. Overrides are always possible and audited.

### Data retention and deletion

- Each company chooses a retention period (`settings.retentionDays`). `retention.sweep` (every 6 hours) erases candidate data past retention.
- Recruiters can file deletion requests per candidate (`DataDeletionRequest`); `privacy.delete` erases transcripts, answers, evaluations, recordings, résumés and contact details. Audit entries keep only non-personal metadata.
- Storage objects (résumés, recordings, logos) are deleted along with their rows.

### Data minimisation

- Only the candidate's first name and a masked email appear on public pages.
- IP addresses are stored only as keyed hashes (HMAC-SHA-256 with the server secret).
- Audio is not stored unless recording is enabled and consented to; browser speech recognition keeps audio on the device.
- The optional camera is a self-view preview only: the company opts in (Settings → Privacy), each candidate opts in with a recorded `CAMERA` consent, and video stays in the browser — it is never recorded, uploaded or analysed, and appearance is never assessed.

## Operating checklist

- [ ] `AUTH_SECRET` is at least 32 random bytes and different per environment
- [ ] `APP_URL` is the public HTTPS origin; `AUTH_TRUSTED_ORIGINS` lists any extra origins
- [ ] `DEMO_MODE=false` and real provider keys stored in a secret manager, never in the repo
- [ ] Database: managed PostgreSQL with TLS, backups, point-in-time recovery, least-privilege user
- [ ] Object storage bucket private; served only through signed or authorised routes
- [ ] `apps/worker` running so evaluations, emails and retention jobs execute
- [ ] Error monitoring configured (`SENTRY_DSN`) with PII scrubbing
- [ ] Email sender domain authenticated (SPF, DKIM, DMARC)

## Hardening backlog

- Nonce-based CSP once Next.js supports it cleanly with streaming
- Optional WebAuthn / SSO (SAML, OIDC) for enterprise recruiters
- Malware scanning for uploads
- Sandboxed code execution for coding questions (provider interface exists, disabled by default)
- Redis-backed rate limiting for very high traffic
