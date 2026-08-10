# Final Improvement Recommendations

Prioritized punch list for taking AveronAi from "solid product with real customers on
a handshake" to "real, scalable SaaS business." Ordered by priority within each tier —
not everything here needs to happen before launch (see
[production-checklist.md](production-checklist.md) for the actual go/no-go line).

## Tier 1 — Blocks a self-serve paid launch

1. **Payment collection (Stripe or equivalent).** The single biggest gap. Plans,
   limits, and enforcement are real and tested (`application/billing/*`); nothing
   actually charges a card. Scope: Stripe Checkout for new subscriptions, Stripe
   Customer Portal (or a custom equivalent) for self-service plan changes/cancellation,
   a webhook handler updating `subscriptions.status` from Stripe events, and a
   decision on what happens to data access when a subscription lapses (the
   `past_due`/`canceled` states already exist in the `company_status` enum — the
   billing side just isn't connected to a real payment event yet).
2. **Configure the n8n scheduled-trigger workflow** (or an equivalent scheduler) for
   the four `/api/trigger/*` routes. Code-complete and tested; genuinely just needs
   someone to go set up the external cron. See deployment-guide.md §6.
3. **Legal**: Terms of Service, Privacy Policy, and a data-processing agreement
   template for customers whose own customers' data flows through this (real estate
   leads scraped from social platforms carry real privacy obligations depending on
   jurisdiction). Not a code task, but blocks a legitimate public launch regardless.

## Tier 2 — Should happen in the first post-launch quarter

4. **Wire up a real error-tracking service** (Sentry or similar) via the existing
   pluggable hook in `infrastructure/observability/logger.ts::setErrorReporter` — the
   seam already exists, this is genuinely a small task (call `setErrorReporter` once
   at startup behind an env var check).
5. **Postgres Row-Level Security as defense-in-depth** under the existing app-layer
   tenant isolation. Not urgent (isolation is real and tested today), but the natural
   next hardening step once there's a customer with a real compliance requirement.
   Requires `infrastructure/db/client.ts`'s `db()` singleton to support per-request
   `SET LOCAL app.current_company_id` — a structural change, scope it as its own
   project, don't bolt it on quickly.
6. **A platform-wide operations view** for the AveronAi team itself — today
   `/admin/sync` and the dashboard's stats are all per-company; there's no single
   place to see "which customers have unhealthy syncs right now" across the whole
   platform. Useful the moment there are more than a handful of customers.
7. **Fix the `storage_kb` usage counter** to actually decrement when data is pruned or
   a company deletes a dataset — currently only grows (documented in
   `docs/tech-debt.md`). Low urgency today given generous storage limits, but it's a
   real metric-drift bug that will eventually block a legitimate plan downgrade.
8. **Close the buyer-side data collection gap.** This is a product/data-sourcing
   problem, not a code problem (see `docs/tech-debt.md`'s "product-level gap" entry):
   most data currently flowing in is seller listings, not buyer intent posts, which
   is the actual product promise. The on-demand scrape-request system built this
   session (actor templates + Collect Data page) is the tool to close this with —
   someone needs to actually register templates for buyer-side sources (Facebook
   buyer groups, keyword searches, commenter mining on listing posts) and use them.

## Tier 3 — Worth doing, not urgent

9. **A load/concurrency test for the two race-condition fixes made this pass** (login
   lockout, Apify budget check) — both are correct by construction (Postgres advisory
   locks), but there's no automated test proving it under real concurrency, since the
   architecture (safe actions needing a request context) makes that awkward to write
   cheaply today. A k6/Artillery script hitting `signIn` concurrently against a test
   deploy would be the natural shape.
10. **Content-Security-Policy header.** Not flagged as a launch blocker (nothing in
    the app renders untrusted HTML), but a reasonable defense-in-depth addition
    alongside the security headers already set in `next.config.ts`.
11. **Indexed search for the `locations`/`propertyTypes` array-search branches**
    (documented limitation, `docs/tech-debt.md`) — revisit if per-company lead volume
    grows enough that search latency becomes a measured problem, not before. The fix
    path is already scoped in the tech-debt entry (a custom `IMMUTABLE` SQL function
    or a generated column).
12. **Link the customer user guide from inside the product.** A full DOCX user guide
    covering all ten onboarding/usage topics was produced separately this session —
    add a help link in the app topbar pointing to wherever it ends up hosted.
13. **A connection pooler** (PgBouncer, or your Postgres provider's built-in one) if
    deploying to a platform with many concurrent serverless function instances against
    the current small connection pool (`max: 10`) — a capacity-planning item, not a
    correctness bug, worth having a plan for before it's actually needed.

## What's already genuinely solid (don't re-litigate these)

Worth stating explicitly so future work doesn't waste time re-auditing settled ground:

- **Multi-tenant data isolation** — audited by direct trace across every action/query
  this session, proven by `e2e/multi-tenant.spec.ts`, zero findings.
- **SQL injection surface** — audited specifically, including the open-ended dynamic
  `attr.*` filter path, zero findings.
- **Password/session security** — scrypt hashing, constant-time verification, DB-backed
  session revocation, all correct.
- **Test coverage** — genuinely comprehensive across every product area (328
  automated tests: 191 unit + 99 integration + 40 e2e, all passing), not just a token
  suite.
- **CI** — already enforces typecheck/lint/unit/integration/e2e on every PR.
- **Caching strategy** — deliberate, tag-invalidated, applied only where the argument
  space is actually bounded. Not over- or under-applied.
- **The core product loop** (discover → ingest → normalize → classify → identify →
  dedupe → score → serve → alert, plus the newer on-demand collection and
  data-validation scoring layers) — functionally complete, tested, and internally
  consistent with the product's own stated design principles throughout.
