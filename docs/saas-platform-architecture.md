# SaaS Platform Architecture — Multi-Tenant AveronAi

**Status: Phases 1–4 and 6 are built** (schema, auth, every application-layer query
scoped by `companyId`, a real `/signup` flow, proven by `e2e/multi-tenant.spec.ts` and
a dedicated integration-test case per touched module). **Phase 5 is now mostly built
too — plan structure, usage tracking, limit enforcement, and the upgrade/downgrade
flow all exist (see docs/pricing-strategy.md for the full design); only real Stripe
payment collection is still missing.** Postgres RLS is not built — see "What's
actually built" below for the precise boundary.
Built and proven against fresh sandbox databases (`averon_ai_test`/`averon_ai_e2e`),
never against `averonai_dev` — applying this to real data still needs
`infrastructure/db/backfill-company.mjs` run there first, by a human, deliberately.

## What's actually built

- **Schema**: `companies`/`plans`/`subscriptions` tables; `companyId` (`NOT NULL`,
  indexed) on every tenant table listed in the original design below; composite unique
  indexes replacing the old global ones on `leads` (identity fields) and `alert_rules`/
  `sources` (name). `mapping_profiles`/`fx_rates`/`location_aliases` correctly stayed
  global — a correction from this doc's original design, made during implementation
  (mapping profiles are payload-shape reference knowledge, not business data).
- **Auth**: JWT `SessionPayload`/`CurrentUser` carry `companyId`; the old "first
  sign-in claims the instance" bootstrap is gone, replaced by
  `application/auth/signup.actions.ts::signUp` + `/signup`; `AUTH_ALLOWED_EMAILS`
  repurposed from instance-bootstrap-gate to company-creation-gate.
- **Every application-layer query and action** scoped by `companyId` — see the file
  list in the original design section below; two real cross-tenant bugs were found
  and fixed in the process (`lead.actions.ts` and `dataset.actions.ts` previously did
  zero ownership checks on a bare `leadId`/`datasetId`, single-tenant-harmless until
  now).
- **Proof, not just compilation**: `e2e/multi-tenant.spec.ts` (company A's admin can't
  see company B's lead in the list, in search, or by guessing its id against
  `/api/leads/[leadId]/appearances` directly) plus a cross-tenant regression case
  added to `dispatch.integration.test.ts` and `process-records.integration.test.ts`.
- **Not built**: RLS (deferred — see "Tenant isolation" below), real Stripe payment
  collection (`subscriptions` rows exist and drive real enforcement, but nothing
  populates `providerCustomerId`/etc. — see docs/pricing-strategy.md's "What's
  deliberately not built"), the multi-step onboarding wizard from the original
  design (signup lands straight on the existing empty-state `/leads` — invite-team and
  connect-source already existed and needed no new UI).
- **Subscription/billing system** (later pass, on top of the above): four real,
  priced plans (`Starter`/`Professional`/`Business`/`Enterprise`, seeded by
  `infrastructure/db/seed.mjs` — the plan catalog lives in the database, not
  hardcoded), each with seat/dataset/data-fetch/lead/alert-rule/Apify-request/storage
  limits (`plans` table, `application/billing/usage.ts`). Every new company gets a
  real `subscriptions` row (Starter, trialing) from the moment it signs up — closing
  a gap where signups previously had no subscription at all and so no limits were
  ever enforced. Usage is tracked via a live `COUNT(*)` for small/infrequent
  resources (seats, datasets) and an aggregate `usage_counters` table for
  high-volume/monthly ones (leads, raw records, Apify requests, cumulative storage);
  enforcement is a synchronous throw for user-facing actions and a non-throwing
  check for the background sync engine (skip and log, never crash a cron tick).
  Owners can switch plans from `/admin/billing`
  (`application/billing/plan.actions.ts::changePlan`) — allowed iff current *stock*
  usage (seats/datasets/alert-rules/storage) already fits the target plan, with no
  explicit "upgrade vs. downgrade" concept needed. The public `/pricing` page reads
  the same DB rows the enforcement code uses, so marketing can never drift from what's
  actually enforced. Full rationale (cost basis, tiering psychology, the pricing
  numbers themselves) is docs/pricing-strategy.md. Proven by `e2e/billing.spec.ts`
  and integration tests for the usage/limit/plan-change logic.
- **Role hierarchy + email invites + self-service password reset** (later pass, on
  top of the above): `users.role` is now a fixed 4-tier hierarchy —
  `owner > admin > manager > member` (`domain/auth/permissions.ts`) — replacing the
  old 2-value `admin`/`agent` enum. The company's signup creator is `owner`; only an
  owner may grant/edit another owner (`canAssignRole`); at least one owner per company
  is always enforced. `roles`/`permissions`/`role_permissions`/`user_roles` (§5) remain
  the unenforced *custom*-role extension point they always were — this hierarchy is a
  separate, simpler, enforced layer, not built on those tables. The old admin-creates-
  account-with-a-temporary-password path (`team.actions.ts::createTeamMember`) is
  replaced by a real invite: `application/auth/invite.actions.ts` creates a pending,
  expiring, single-use `invites` row and emails a link (degrades to showing the link
  on screen, same pattern as `email.notifier.ts`, when `RESEND_API_KEY` is unset); the
  recipient sets their own password at `/invite/[token]` and is created + signed in
  only then. `application/auth/password-reset.actions.ts` adds a parallel self-service
  "forgot password" (`/forgot-password` → emailed link → `/reset-password/[token]`),
  distinct from the admin-issued temporary-password reset, which still exists
  unchanged. Proven by `e2e/team-invite.spec.ts` and integration tests for both new
  query helpers.

## Original design (for what's not built yet)

**Status: design only, not built** applies to everything below this point — real
Stripe payment collection (Checkout/Customer Portal/webhooks) and RLS, specifically.
The plan-structure/usage-tracking/enforcement/upgrade-downgrade parts of the original
Phase 5 sketch below **are** now built, differently than originally sketched in some
details — see docs/pricing-strategy.md for what actually shipped instead of treating
the Stripe-era mockups below as current.

## Why this document exists

Today's schema (`infrastructure/db/schema/*.ts`) has no tenant concept anywhere:
`users` has no `companyId`, `sources`/`datasets`/`leads`/`alert_rules`/etc. are global
tables, and the pipeline (`domain/`, `application/`) is written assuming exactly one
organization's data exists in the database. The layered architecture
(`domain → application → infrastructure → features`) described in
[architecture.md](architecture.md) is sound and should survive this change almost
entirely intact — multi-tenancy is a cross-cutting concern threaded through every
layer, not a reason to rearchitect the layers themselves.

---

## 1. Complete system flow

```
                         ┌─────────────────────────────────────────┐
                         │              COMPANY (tenant)             │
                         │  owner + team members, one subscription   │
                         └──────────────────┬────────────────────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
        USER MANAGEMENT                 DATA PIPELINE                  BILLING
              │                              │                              │
   signup → owner account        DISCOVER → PROBE → INGEST      Stripe Checkout/Portal
   invite → team member              → NORMALIZE → CLASSIFY      plan, seats, usage
   roles: owner/admin/manager/member  → IDENTIFY → DEDUPE                   │
   JWT session + companyId            → ROLLUP → SERVE → ALERT    webhook → subscriptions
              │                              │                     table kept in sync
              │                    (all scoped to companyId,
              │                     RLS-enforced at the DB)
              │                              │                              │
              └──────────────────────────────┼──────────────────────────────┘
                                             │
                                    every row tagged companyId
                                    every query scoped companyId
                                    every plan limit checked companyId
```

**Tenant isolation is the organizing idea of the whole system.** Every table that
currently has no owner gets one (`companyId`), every query that currently reads
"everything" reads "everything for this company," and the database itself enforces
that boundary via Row-Level Security so an app-layer bug (a forgotten `WHERE`) fails
closed, not open. This is the single most important architectural decision in this
document — see §5.

**Per-tenant data flow is otherwise the same 10-stage pipeline AveronAi already runs**
(`DISCOVER → PROBE → INGEST → NORMALIZE → CLASSIFY → IDENTIFY → DEDUPE → ROLLUP →
SERVE → ALERT`, [architecture.md](architecture.md)) — nothing about scoring, dedup, or
ranking logic changes conceptually. What changes is that `discoverAllSources()`,
`syncDataset()`, `processRawRecords()`, `dispatchAlertsForLeads()` all now operate
within one company's data at a time, and the scheduler tick (`/api/trigger/sync`)
iterates *across every company's* due datasets in one pass — the existing
`dueDatasets(10)` pattern already batches correctly; it just needs `companyId` added
to what it selects on.

**Billing is a parallel, mostly-decoupled system.** Stripe is the system of record for
payment/invoicing; this platform only mirrors subscription *state* (plan, status,
period) needed to gate features — it does not reimplement invoicing, tax, or dunning.

---

## 2. User journey flow

### New company (self-serve signup)

```
Visit /signup
  → enter company name + your email + password
  → account created: you = "owner" role, company created in "trialing" status
  → redirected to onboarding wizard:
      1. Connect a data source (Apify token, or "I'll do this later")
      2. Invite teammates (optional, skippable)
      3. Land on empty /leads inbox with an empty-state CTA
  → 14-day trial clock starts (companies.trialEndsAt)
```

This replaces today's bootstrap ("first sign-in on a fresh instance claims admin" —
[architecture.md](architecture.md)'s Auth model) — that mechanism only made sense for
a single-instance internal tool. `AUTH_ALLOWED_EMAILS` (today's bootstrap guard) goes
away entirely; self-serve signup is the point of a SaaS product.

### Invited team member

```
Owner/admin sends invite (email + role) from /admin/team
  → pending, expiring `invites` row created; emailed a link (or shown on screen
    if no mail provider is configured — application/auth/invite.actions.ts)
  → invitee opens /invite/[token], sets their own name + password
  → account created only now, in the inviter's company, with the invited role
  → signed in immediately, lands on /leads
```

Only an owner may invite/promote someone to `owner`; admin and above may assign
`manager`/`member`. The old admin-issued-temporary-password path
(`team.actions.ts::resetTeamMemberPassword`) still exists for resetting an *existing*
member's credential, but no longer for creating one.

### Day-to-day agent

```
Sign in → /leads inbox (already scoped to companyId via RLS + query filters)
  → filter/search/triage leads exactly as today
  → mark contacted, change status, assign, note — all lead_states writes,
    unchanged logic, now company-scoped
```

No change to the actual triage UX — this is the part of the product that already
works well and should not be touched by the multi-tenancy retrofit.

### Owner managing the account

```
/admin/billing → see current plan, seat usage, next invoice date
  → "Upgrade" → Stripe Checkout (hosted, not custom-built)
  → "Manage billing" → Stripe Customer Portal (hosted — payment method,
    invoices, cancel)
  → webhook keeps subscriptions table in sync with what Stripe says happened
```

### Trial expiry / plan limit hit

```
Trial ends, no payment method on file
  → company status → "past_due" → read-only banner, no new syncs, existing
    data still visible (never delete on non-payment — degrade access, not data)
  → owner adds payment method → status → "active" → full access restored
```

Same "degrade gracefully, never destroy data on failure" posture the rest of this
codebase already follows (FX refresh, notifiers) — non-payment is a degrade, not a
data-loss event.

---

## 3. Backend architecture plan

Layering stays exactly as documented in [architecture.md](architecture.md):
`domain → application → infrastructure`, `features`/`app` depend on `application`
only. Multi-tenancy and billing are new modules following the *same* conventions
already established, not a new pattern:

```
domain/
  company/            NEW — pure rules: plan-limit checks, role permission checks
  billing/             NEW — pure rules: what a plan tier allows (ports only, no Stripe SDK)
  ...existing domain/ subfolders unchanged in shape, all now take/return
  data that happens to include companyId, same "no I/O" contract

application/
  companies/            NEW — company.actions.ts, company-queries.ts
                         (mirrors team.actions.ts's existing shape)
  billing/               NEW — billing.actions.ts (create checkout session,
                         open portal), subscription-queries.ts
  auth/
    signup.actions.ts    NEW — company + owner creation in one transaction
    ...existing login.actions.ts, team.actions.ts unchanged in shape, every
    query inside gains a companyId scope
  leads/, datasets/, sync/, alerting/, fx/, maintenance/
                         UNCHANGED in shape — every *-queries.ts function gains
                         a companyId parameter (or reads it from an
                         already-scoped session context), every *.actions.ts
                         already goes through authActionClient, which now also
                         injects ctx.user.companyId

infrastructure/
  billing/
    stripe.client.ts     NEW — adapter, implements a `BillingProvider` port
                         (mirrors apify.connector.ts / email.notifier.ts
                         adapter pattern exactly)
  db/
    client.ts            CHANGED — db() call sets the RLS session variable
                         (see §5) per request/transaction
    schema/company.ts    NEW — companies, subscriptions, plans tables
    schema/*.ts          CHANGED — companyId column + index added to every
                         tenant-owned table
  ...apify/, notifiers/, auth/, fx/, observability/ unchanged

app/
  (auth)/signup/        NEW route
  (app)/admin/billing/  NEW route
  api/webhooks/stripe/  NEW system route (mirrors api/webhooks/apify/route.ts's
                         secret-verification + after() pattern, but Stripe's
                         own signature scheme, not secretsMatch())
  ...everything else unchanged in URL shape
```

**`authActionClient` (`application/safe-action.ts`) is the single choke point that
makes this retrofit tractable.** Every server action already goes through it; adding
`companyId` to the `ctx` it injects (alongside the existing `SessionPayload`) means
every *existing* action gets tenant-scoping available for free at its call site — the
work is auditing each action's queries to actually use `ctx.user.companyId`, not
redesigning the auth plumbing. Same story for the four internal read routes
(`/api/leads`, `/api/leads/facets`, etc.) — they already call `currentUser()`, which
now also returns `companyId`.

**Job scheduling stays external (n8n) per the existing Phase-1 design**
([tech-debt.md](tech-debt.md), [environment.md](environment.md)) — `/api/trigger/sync`
still just calls `dueDatasets(10)` and loops, except `dueDatasets` now naturally
returns due datasets *across every company*, since the query has no per-company
filter (there's no reason for one — a scheduler tick should drain whatever's due
platform-wide, same as today). Per-company isolation happens inside `syncDataset()`
and everything downstream of it, not in what the scheduler selects.

---

## 4. Frontend architecture plan

`features/` keeps its existing one-folder-per-application-module convention
([coding-standards.md](coding-standards.md)):

```
features/
  onboarding/       NEW — signup form, connect-source wizard step, invite-team step
  company/          NEW — company settings (name, timezone, danger-zone delete)
  billing/          NEW — plan display, usage meters, "Upgrade"/"Manage billing"
                    buttons that redirect to Stripe-hosted pages (no custom
                    payment form — never handle card data directly)
  auth/, leads/, datasets/, pipeline/, intelligence/, team/, shell/
                    UNCHANGED in shape and internals
```

**No custom billing UI beyond plan display and two redirect buttons.** Stripe
Checkout and the Stripe Customer Portal are both fully hosted — building a custom
subscription-management UI is the kind of thing this codebase's own philosophy
already warns against ("Not a CRM... don't build [X] here" — [prd.md](prd.md)'s
non-goals section applies equally to "don't build a billing UI here, Stripe already
owns that surface").

**No company switcher.** This design deliberately keeps one user → one company
(matches today's already-built team-invite flow, where an invitee has no choice of
which org they land in). A user who needs to work across two companies gets two
separate accounts (two emails) — the same tradeoff most single-org-per-user B2B SaaS
products make. Multi-org membership is a real feature some products need, but nothing
in the current requirements calls for it, and it meaningfully complicates the session
model (which companyId is "active" right now); leave it out unless a real need shows
up, per this codebase's own stated aversion to speculative abstraction
([coding-standards.md](coding-standards.md)).

**React Query stays scoped to the leads/datasets search surface only**, exactly as
today ([architecture.md](architecture.md)) — billing/company/onboarding pages read
once per navigation via Server Components, no new client-cache surface needed.

---

## 5. Database architecture recommendation

### New tables

```
companies
  id, name, slug (unique, for future subdomain routing), status
    (trialing|active|past_due|canceled), trialEndsAt, createdAt, updatedAt

plans
  id, name, stripePriceId, maxSeats, maxDatasets, maxLeadsPerMonth,
  maxAlertRules, dataRetentionDays, features (jsonb, open-ended flags)
  — a DB table, not a hardcoded enum, because "config lives in the database,
  not the environment" is already this codebase's stated philosophy
  (architecture.md) and a plan's limits are exactly that kind of config —
  changing a limit should be an admin edit, not a deploy.

subscriptions
  id, companyId (FK, unique — one active subscription per company),
  planId (FK), provider ("stripe"), providerCustomerId,
  providerSubscriptionId, status, currentPeriodStart, currentPeriodEnd,
  seats, createdAt, updatedAt
  — mirrors Stripe's state, does not replace it. Stripe stays the system of
  record for actual payment/invoice history; query Stripe (or link to the
  Customer Portal) for that, don't duplicate invoice line items here.
```

### Every existing tenant-owned table gains `companyId`

`users`, `sources`, `datasets`, `mapping_profiles`, `dataset_versions`,
`field_catalog`, `raw_records`, `leads`, `lead_appearances`, `lead_states`,
`lead_events`, `alert_rules`, `alert_deliveries`, `saved_views` — `NOT NULL`,
indexed, denormalized directly onto each table rather than only reachable via a join.
This is deliberate: a defense-in-depth tenant boundary (below) needs `companyId` to
be a column the database can filter on directly for *every* row, not a value you have
to join three tables to discover.

**Global, not tenant-scoped:** `fx_rates` (currency rates aren't tenant data) and
`location_aliases` **if** the platform stays Bali-only; if the SaaS expands beyond
one region, `location_aliases` needs `companyId` too (or a `region` scope) — flagged
as a decision to make explicitly if/when a second market is ever onboarded, not
guessed at now.

**Identity-resolution uniqueness must become tenant-scoped.** Today's
`leads_facebook_id_key`/`leads_instagram_id_key`/`leads_profile_url_key` are *global*
unique indexes (`infrastructure/db/schema/leads.ts`). Once two different companies
can both have a lead with the same scraped `facebookId` (two agencies scraping
overlapping public groups is entirely plausible), a global unique index would
incorrectly merge two different companies' leads into one row — a correctness bug,
not just an isolation gap. These become composite unique indexes:
`(company_id, facebook_id)`, `(company_id, instagram_id)`, `(company_id,
profile_url)`. This is the single most important data-correctness change in the
entire retrofit — everything else is "add a filter," this one is "a wrong merge
across two paying customers' data," which per this codebase's own stated risk
posture (`architecture.md`: "a wrong merge is worse than a duplicate") is the worst
failure mode in the whole design.

### Tenant isolation: Postgres Row-Level Security, not just app-layer `WHERE`

**Recommendation: RLS as the hard boundary, app-layer `companyId` filters as the
fast/readable layer on top — belt and suspenders, not either/or.** This mirrors a
pattern already in this codebase (`mustChangePassword` gated at two independent
layers, `requireUser()` *and* `authActionClient` — see architecture.md's Auth model —
specifically because a single layer is one bug away from a bypass).

Mechanics:
1. Every tenant-owned table gets an RLS policy: `USING (company_id =
   current_setting('app.current_company_id')::uuid)`.
2. `infrastructure/db/client.ts`'s `db()` sets `app.current_company_id` via `SET
   LOCAL` at the start of each request-scoped transaction, from the already-verified
   `ctx.user.companyId` (`currentUser()` output) — never from a client-supplied
   value.
3. Every existing `*-queries.ts`/`*.actions.ts` function keeps its own explicit
   `WHERE companyId = ...` too (readable, and what actually gets exercised by unit/
   integration tests) — RLS is the backstop for the query that *doesn't* get one,
   whether from a bug or a rushed future change, not the primary mechanism anyone
   reasons about while reading a query.

This is why shared-database-with-RLS (not schema-per-tenant, not database-per-tenant)
is the recommendation: it's the standard, well-understood scaling pattern for
B2B SaaS at "many users, many companies, one Postgres" scale, it's a small, additive
change to the existing single-Postgres-instance setup (no new infrastructure), and
Drizzle + `postgres` (both already in this stack) support session-scoped RLS cleanly.
Database-per-tenant only earns its operational cost at a compliance-driven enterprise
tier — worth keeping as a *future* "dedicated" plan option, not a v1 requirement.

### Migration shape (expand → backfill → contract)

1. Add every `companyId` column **nullable** first, plus the new `companies` table.
2. Create one `companies` row for today's existing data (the current Bali company),
   backfill every existing row's `companyId` to it.
3. Add the new composite unique indexes (identity resolution), drop the old global
   ones.
4. Set every `companyId` column `NOT NULL`.
5. Enable RLS policies.
6. Audit and update every `*-queries.ts`/`*.actions.ts` call site to scope by
   `companyId` (mechanical, but must touch every file — see §3).
7. Replace the bootstrap-claims-admin flow with real `/signup`.

This is the standard zero-downtime expand/contract shape — no step drops data, no
step requires the app to be offline, and each step is independently verifiable
(matches this codebase's existing bar: "a unit test compiling a query vs. actually
executing it... is why the integration/e2e tiers exist," testing-strategy.md — the
same discipline applies to a migration this size: each step gets its own
integration-test pass before the next one starts).

---

## 6. API architecture recommendation

**No public REST API in v1** — same posture as today ([api-patterns.md](api-patterns.md):
"design that surface then — don't retrofit these"). Everything stays server actions +
the existing narrow set of internal route handlers, all now tenant-scoped through
`ctx.user.companyId`.

**New system route: `POST /api/webhooks/stripe`.** Same shape as the existing Apify
webhook (`after()` for fast ack, structured logging, no work done before responding)
but auth is Stripe's own signature scheme (`stripe.webhooks.constructEvent()` with a
`STRIPE_WEBHOOK_SECRET`), not `secretsMatch()` — Stripe signs its payloads with a
timestamped HMAC that needs the raw request body, which is a different verification
primitive than the shared-secret header pattern the rest of this codebase uses, so
don't force it through `verify-secret.ts`. Handles `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed` — each one updates the `subscriptions` row and nothing else
(no business logic beyond "keep local state in sync with what Stripe just told us").

**Existing internal read routes (`/api/leads`, `/api/leads/facets`, `/api/leads/stats`,
`/api/datasets`) and the n8n trigger routes (`/api/trigger/*`) are unchanged in
shape** — they already authenticate via `currentUser()`/a shared secret respectively;
both now carry `companyId` through to the query layer, no new route needed.

**Future, explicitly not v1:** a real public API (API keys scoped per company, rate
limited per plan tier via the `plans` table's `features`/limits) — the seam is
`plans.features` already being open-ended JSON, so gating "API access" behind a plan
tier is a config check, not a schema change, whenever that's actually needed. Don't
build the API-key infrastructure before a real second consumer exists — same
"design that surface then" discipline the existing docs already apply to a public API.

---

## Migration plan (phased, not one PR)

Suggested build order once this design is reviewed — each phase independently
shippable and testable, matching how this codebase already prefers to work (small
verifiable steps, integration tests before the next step):

1. **Schema foundation**: `companies`/`plans`/`subscriptions` tables, nullable
   `companyId` everywhere, backfill migration for existing data. No behavior change
   yet — app still works exactly as today.
2. **Auth retrofit**: JWT gains `companyId`, `authActionClient`/`currentUser()`
   inject it, real `/signup` flow replaces bootstrap-claims-admin. App still
   single-company in practice (only one company row exists) but the plumbing is real.
3. **Query scoping audit**: every `*-queries.ts`/`*.actions.ts` function scoped by
   `companyId`, composite unique indexes replace global ones, `companyId` set
   `NOT NULL`, RLS policies enabled. This is the largest, most mechanical phase —
   touches the most files, changes no user-facing behavior for the one existing
   company.
4. **Second company, for real**: verify a second signed-up company sees zero data
   from the first — this is the phase that actually proves tenant isolation works,
   ideally exercised by a new e2e spec before trusting it in production.
5. **Billing**: `infrastructure/billing/stripe.client.ts`, Stripe webhook route,
   `/admin/billing` UI, plan-limit enforcement in the application layer. Needs a real
   Stripe account/API keys to build against — not available in the current session.
6. **Onboarding polish**: connect-source wizard, invite-team step, trial-expiry
   UX — everything in §2's signup journey that isn't already covered by existing
   team-invite code.

Phases 1–4 need no third-party credentials and can be built/tested entirely against
the existing local Postgres setup. Phase 5 is the one hard dependency on something
this session doesn't have — flag before starting it.
