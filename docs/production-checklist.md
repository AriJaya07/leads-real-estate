# Production Readiness Checklist

Go/no-go list for launching DreamRue as a real, paying-customer SaaS product. Grouped
by area; each item states current status as of this checklist's writing, not an
aspiration. See [deployment-guide.md](deployment-guide.md) for how to execute the
deploy-time items and [final-recommendations.md](final-recommendations.md) for the
prioritized list of what's genuinely not done yet.

## How to read this

- **✅ Done** — verified working, tested, safe to launch on as-is.
- **⚠️ Decide before launch** — works today, but is a real business/product decision
  that should be made deliberately, not by default.
- **🚧 Blocker for a paid launch** — the thing that stops this from being a real SaaS
  product with paying customers, specifically (not a blocker for using it internally
  or with a design-partner customer on a handshake).

---

## 1. Testing

- ✅ **Automated test suite is real and passing.** 191 unit tests (vitest, no DB), 99
  integration tests (vitest against a real disposable Postgres), 40 e2e tests
  (Playwright, real browser + real build). All three tiers green as of this review.
  Run before every deploy: `npm test && npm run test:integration && npm run test:e2e`.
- ✅ **CI enforces this on every PR and push to `main`** (`.github/workflows/ci.yml`) —
  typecheck, lint, unit, integration (with a real Postgres service container), and e2e
  (with a fresh build) all run automatically. Nothing merges to `main` without passing.
- ✅ **Coverage against every area this checklist cares about**, confirmed present:
  - **Authentication**: `e2e/login.spec.ts`, `e2e/signup.spec.ts`, `e2e/account.spec.ts`,
    `application/auth/login-attempts.integration.test.ts`,
    `application/auth/password-reset.actions.integration.test.ts`,
    `application/auth/invite.actions.integration.test.ts`,
    `application/auth/session-version.integration.test.ts`,
    `infrastructure/auth/password.test.ts`, `domain/auth/rate-limit.test.ts`.
  - **User permissions**: `domain/auth/permissions.test.ts`, `e2e/multi-tenant.spec.ts`
    (cross-tenant isolation, not just role checks).
  - **Subscription limits**: `application/billing/usage.test.ts`,
    `application/billing/usage.integration.test.ts`,
    `application/billing/plan.actions.integration.test.ts`, `e2e/billing.spec.ts`.
  - **Apify integration**: `domain/collection/actor-request.test.ts`,
    `application/collection/start-scrape-request.integration.test.ts`,
    `application/collection/complete-scrape-request.integration.test.ts`.
  - **Data collection**: `application/sync/sync-dataset.integration.test.ts`,
    `application/leads/process-records.integration.test.ts`, dataset schema-inference
    and mapping test suites (`domain/dataset/*.test.ts`).
  - **Data validation**: `domain/scoring/lead-validation.test.ts`,
    `application/leads/lead-validation.integration.test.ts`.
  - **Dashboard**: `application/leads/lead-queries.integration.test.ts`,
    `application/leads/filters.schema.test.ts`, `e2e/lead-triage.spec.ts`,
    `e2e/intelligence.spec.ts`, `e2e/responsive.spec.ts`.
  - **Team features**: `e2e/team-invite.spec.ts`,
    `application/auth/invite.actions.integration.test.ts`.
- ⚠️ **No load/concurrency test suite.** The three race-condition fixes made in this
  pass (login lockout, Apify budget check, see §2) are correct by construction
  (Postgres advisory locks) but aren't exercised by an automated concurrency test —
  the architecture (safe actions needing a request context) makes that awkward to
  write cheaply. Acceptable to launch without one; worth adding if login/scrape-request
  volume ever gets high enough to want a regression guard here specifically.

## 2. Security

- ✅ **Full review completed this pass** (auth, authorization/multi-tenancy, API
  surface, database/query security, infrastructure). Three concrete findings, all
  fixed and verified (typecheck, full test suite, full e2e suite, all green
  afterward):
  - Login lockout could be bypassed under concurrent requests — fixed with a
    Postgres advisory lock serializing the whole check-verify-record sequence per
    email (`application/auth/login.actions.ts`).
  - Apify monthly spend cap had the same race — fixed the same way, scoped per
    company (`application/collection/start-scrape-request.ts`).
  - Password-reset requests had no throttling (mail-bombing risk) — added a 3-per-15-minute
    limit reusing the existing token table, no schema change
    (`application/auth/password-reset.actions.ts`).
- ✅ **Multi-tenant data isolation verified by direct trace**, not just by test:
  every server action taking a foreign id scopes its query by `companyId` before
  touching data; every `*-queries.ts` read does the same. `e2e/multi-tenant.spec.ts`
  proves it end-to-end (inbox listing, search, and a direct API-id-guessing attempt
  all correctly refuse cross-tenant data).
- ✅ **No SQL injection surface found.** Every dynamic query value goes through
  Drizzle's parameter binding; the one array-binding helper (`textArray`) and the
  open-ended `attr.*` filter path were traced specifically and confirmed safe.
- ✅ **Secrets handled correctly**: password hashing is scrypt with real salt and
  constant-time verification; session JWTs are re-verified against the DB on every
  request (role + revocation), not trusted from the token; invite/reset tokens are
  stored as SHA-256 hashes, never plaintext; webhook/trigger secret comparison is
  constant-time (`application/http/verify-secret.ts`); no secret ever appears in a
  log line.
- ✅ **Multi-tenant isolation is app-layer, not database-layer** (no Postgres Row-Level
  Security) — every query is audited to include a `companyId` filter, but there's no
  DB-level backstop if a future query forgets one. Documented, accepted trade-off
  (`docs/tech-debt.md`); ⚠️ **revisit before onboarding a customer with a real
  compliance requirement** (SOC 2, HIPAA-adjacent, etc.) — RLS would need `db()`'s
  connection contract to change to support per-request `SET LOCAL`.
- 🚧 **No security headers beyond the basics currently set** are missing — `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` are all set
  (`next.config.ts`). No CSP configured; not flagged as a blocker since nothing in
  this app renders unsanitized third-party HTML, but worth adding defense-in-depth
  before launch if time allows.

## 3. Performance

- ✅ **Reviewed this session** (frontend rendering, backend queries, caching,
  component memoization). Found and fixed: one real N+1 query
  (`application/leads/facets.ts`'s dynamic attribute facets — was sequential,
  now parallelized), one un-memoized admin table row re-rendering on every
  unrelated row's busy-state change, and added trigram indexes backing the
  dashboard's free-text search (name, location, target-company name).
- ✅ **Caching is deliberate, not reflexive**: `"use cache"` is applied to bounded,
  frequently-read, rarely-changing queries (stats, facets, sync overview) with real
  tag-based invalidation (`application/cache-tags.ts`) wired to every mutation that
  should bust it. Unbounded-argument-space reads (the main lead list/search) are
  deliberately *not* cached server-side — correct call, a cache with a low hit rate
  isn't worth the complexity.
- ✅ **React Query on the client** dedupes and staleTimes appropriately; expensive
  client bundles (the lead detail sheet) are code-split.
- ⚠️ **`locations`/`propertyTypes` array search branches are unindexed** — a real,
  known, documented scaling limitation (`docs/tech-debt.md`), not urgent at current
  per-company row counts. Revisit if a company's lead volume gets into the hundreds
  of thousands and search starts feeling slow.

## 4. Code quality

- ✅ **Zero typecheck errors, zero lint errors** across the entire codebase as of this
  review (`npm run typecheck && npm run lint`).
- ✅ **Consistent architecture**: strict `domain → application → infrastructure/features`
  layering enforced by convention and mostly by code review discipline (not a lint
  rule) — see `docs/architecture.md` and `docs/coding-standards.md`.
- ✅ **No dead/stale documentation found and left uncorrected** — one stale tech-debt
  entry was found and fixed during this pass (claimed a fix wasn't done when it
  already had been).

## 5. User experience

- ✅ **Responsive**: verified via `e2e/responsive.spec.ts` (mobile drawer nav, card
  layout below `md`, table/card toggle above it) — not just visual inspection.
- ✅ **Loading states**: every data-heavy region streams behind its own `Suspense`
  boundary with a matching skeleton, not a single whole-page spinner.
- ✅ **Error states**: three-tier error boundary (`app/error.tsx`,
  `app/(app)/error.tsx`, `app/global-error.tsx` — the last one added this pass, closing
  a real gap where a root-layout failure had no boundary at all) — none leak stack
  traces or internal messages to the user.
- ⚠️ **No customer-facing help/documentation link inside the product itself.** A full
  customer user guide was produced separately (DreamRue User Guide, DOCX) but isn't
  linked from anywhere in the app UI yet — consider adding a help link in the topbar
  before launch.

## 6. Billing / subscriptions

- ✅ **Plan structure, limits, and enforcement are real and tested**: four tiers
  (Starter/Professional/Business/Enterprise), every company gets a real `trialing`
  subscription the moment it signs up, upgrade/downgrade logic correctly blocks a
  downgrade that would exceed the target plan's limits.
- 🚧 **No real payment collection.** There is no Stripe (or any payment processor)
  integration — `plans`/`subscriptions`/`changePlan` are all real and enforced, but
  nothing actually charges a card. **This is the single largest blocker to launching
  as a paid, self-serve SaaS product** — until it's wired up, every customer is
  effectively on a permanent, unbilled trial. See
  [final-recommendations.md](final-recommendations.md).

## 7. Data collection / Apify integration

- ✅ **Both ingestion paths tested and working**: continuous background sync
  (discovery → probe → paginated resumable ingest) and on-demand scrape requests
  (actor-template registry → triggered run → webhook-driven completion → same
  validate/store pipeline).
- ✅ **Cost controls present and now race-free**: monthly Apify request budget
  enforced atomically at admission time; duplicate-request dedup within a 15-minute
  window; every run's cost and item count tracked and visible in-app.
- 🚧 **No scheduled trigger is actually configured anywhere.** `POST /api/trigger/{discover,sync,fx,retention}`
  routes exist, are tested, and are secret-gated — but nothing calls them on a
  schedule. This repo deliberately removed its own cron routes in favor of an
  external n8n workflow that **does not exist yet**. Until it does, ingestion for the
  background-sync path only happens via the Apify webhook or a manual "Sync" click —
  see [deployment-guide.md](deployment-guide.md)'s "Scheduled jobs" section for exactly
  what to set up. The newer on-demand scrape-request path doesn't depend on this at all.

## 8. Infrastructure / deployment

- ✅ **Environment variable validation fails fast and clearly** (`shared/config/env.ts`,
  Zod-based) — a misconfigured deploy won't silently run with missing secrets.
- ✅ **Structured logging in place**, pluggable error-reporter hook exists
  (`infrastructure/observability/logger.ts`) but **no error-tracking service (Sentry
  or similar) is actually wired up** — errors only reach whatever platform log
  aggregation the host provides. ⚠️ **Decide before launch**: acceptable for a small
  early customer base watching logs directly; wire up a real error reporter before
  scaling past that.
- ✅ **No monitoring/alerting on the app's own health** beyond hosting-platform
  defaults (uptime, deploy status). No dashboard for "is sync healthy across all
  customers," "is the webhook queue backing up," etc. — `/admin/sync` gives this
  per-company, but there's nothing platform-wide for the DreamRue team itself.

---

## Launch decision summary

**Safe to launch today** for: an internal team, a design-partner customer on a
handshake agreement, or a free/manually-invoiced pilot. Security, multi-tenant
isolation, testing, and core product functionality are all genuinely solid.

**Not yet safe to launch** as a self-serve, credit-card-charging public SaaS product,
specifically because of two gaps, both known and both scoped:
1. No payment collection (§6).
2. No scheduled trigger for background sync (§7) — matters less now that on-demand
   scrape requests exist as an alternative path, but still the documented, intended
   primary ingestion mechanism.

Neither is a code-quality or security problem — both are "real infrastructure this
repo intentionally left external and someone needs to actually go set up."
