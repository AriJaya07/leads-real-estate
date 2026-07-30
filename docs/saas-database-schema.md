# SaaS Database Schema — Complete Design

**Status: design only, nothing in this document is implemented.** Cross-references
`infrastructure/db/schema/*.ts` (the real, already-built multi-tenant schema — see
`docs/saas-platform-architecture.md`) throughout. Every table below is marked:

- **[BUILT]** — exists today, file cited, described as-is.
- **[NEW]** — proposed, not built, needed to close a real gap in what was asked for.
- **[NOT RECOMMENDED]** — explicitly *not* proposed, with the reason — the brief says
  "avoid duplicate data," and several of the requested categories (`Contacts`,
  `Customer profiles`) map onto tables that already exist under a different name.
  Building the requested table literally-as-named would create a second copy of the
  same entity.

No SQL DDL — field lists and prose, per "do not implement code yet."

---

## 1. User Management

### `users` — [BUILT] `infrastructure/db/schema/auth.ts`

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | NOT NULL, indexed |
| email | text | globally unique (one email = one account, forever — see below) |
| name | text | nullable |
| role | enum(owner, admin, manager, member) | fast-path role — see "Roles vs `users.role`" below |
| password_hash | text | `scrypt$salt$hash` |
| must_change_password | boolean | |
| session_version | integer | JWT revocation counter |
| accepts_assignments | boolean | round-robin opt-out |
| last_seen_at | timestamptz | nullable |
| created_at | timestamptz | |

**Why `email` stays globally unique, not per-company**: one account belongs to exactly
one company. A contractor working for two companies uses two email addresses — the
same tradeoff most single-org-per-user B2B SaaS makes. Keeps login a one-step lookup
(no company disambiguation step) and avoids a second identity-merge problem on top of
the one `leads` already solves.

### `profiles` — [NEW]

| Field | Type | Notes |
|---|---|---|
| user_id | uuid PK, FK → users | 1:1, `ON DELETE CASCADE` |
| avatar_url | text | nullable |
| phone | text | nullable |
| timezone | text | default `Asia/Makassar` |
| locale | text | default `en` |
| job_title | text | nullable |
| bio | text | nullable |
| updated_at | timestamptz | |

**Why split from `users`**: `users` is read on *every* authenticated request
(`currentUser()` — see architecture.md's Auth model) — keeping it narrow keeps that
hot-path row small and cache-friendly. Profile fields (avatar, bio, timezone) change
independently, are read far less often (account settings page, not every request), and
have no business reason to live in the same row. Splitting them out is a plain
1:1 vertical partition, not new modeling — safe to add later without touching `users`.

### `roles`, `permissions`, `role_permissions`, `user_roles` — [NEW]

| Table | Key fields |
|---|---|
| `roles` | id, company_id (nullable — null = system role like "owner"), name, description, is_system |
| `permissions` | id, resource (`leads`\|`datasets`\|`team`\|`billing`\|...), action (`read`\|`write`\|`delete`\|`manage`), description |
| `role_permissions` | role_id, permission_id (composite PK) |
| `user_roles` | user_id, role_id (composite PK) |

**Why this exists alongside `users.role`, not instead of it**: `users.role`
(`owner`\|`admin`\|`manager`\|`member`, ranked in `domain/auth/permissions.ts`) is the
fast path every existing check (`adminActionClient`/`managerActionClient`, page guards)
uses — a single enum comparison, no join. This fixed 4-tier hierarchy is now enforced
(built after this doc's original two-role write-up); this table set remains the
extension point for something *beyond* the fixed hierarchy — a **custom** per-company
role (e.g. "Sales Manager" with a hand-picked permission set), additive on top of
`users.role`, not a replacement for it. `user_roles`/`role_permissions` can layer in
alongside `users.role` without a breaking migration once a real customer asks for a
custom role. Don't build that enforcement logic until then — the schema costs nothing
sitting empty; the enforcement code would.

### `invites`, `password_reset_tokens` — [BUILT] `infrastructure/db/schema/auth.ts`

| Table | Key fields |
|---|---|
| `invites` | id, company_id, email, role, token_hash, invited_by_user_id, expires_at, accepted_at, revoked_at |
| `password_reset_tokens` | id, user_id, token_hash, expires_at, used_at |

Both store only a sha256 hash of a high-entropy random token (never the raw value),
same reasoning as never storing a plaintext password. `invites` backs the email
team-invite flow (`application/auth/invite.actions.ts`, replacing the old direct-create
path); `password_reset_tokens` backs self-service "forgot password"
(`application/auth/password-reset.actions.ts`), separate from the admin-issued
temporary-password reset which is unchanged.

---

## 2. Company Management

### `companies` — [BUILT] `infrastructure/db/schema/company.ts`

The tenant. `id`, `name`, `slug` (unique), `status`
(`trialing`\|`active`\|`past_due`\|`canceled`), `trial_ends_at`, timestamps. Every
business-data table in this document carries a `company_id` back to this table.

### `teams`, `team_members` — [NEW]

| Table | Key fields |
|---|---|
| `teams` | id, company_id, name, description, created_at |
| `team_members` | team_id, user_id, role_in_team (`lead`\|`member`), composite PK |

**Why optional, not required**: today one company = one flat list of users (see
`application/auth/team.actions.ts`) — that's correct for a company with 3–15 agents,
which is most of them. `teams` is a *sub*-grouping for a company large enough to want
"Sales Team Bali" vs "Sales Team Jakarta" as separately filterable/reportable units.
Nullable/unused by default; nothing else in this schema requires a `team_id` — leads,
datasets, alert rules all stay scoped to `company_id`, not `team_id`. Adding a
`team_id` filter on top of `company_id` later is additive, not a redesign.

### `workspace` — [NOT RECOMMENDED as a separate table]

The brief asks for `Workspace` as its own concept. Recommendation: **`workspace` =
`company`, don't build a second table.** A "workspace" in most SaaS products *is* the
tenant boundary — introducing a distinct `workspaces` table nested under `companies`
(company → many workspaces → many teams) adds a whole extra scoping dimension that
nothing in this product's actual requirements calls for yet, and it's the exact kind
of premature abstraction that makes every future query need to decide "scope by
company or workspace?" for no present benefit. If a real customer later needs fully
isolated units *within* one paying company (e.g. an agency running unrelated client
portfolios side by side), that's the day to add `workspaces` as a layer between
`companies` and everything else — a bigger, deliberate migration (every `company_id`
column would conceptually need to become `workspace_id`), not something to build
speculatively now.

---

## 3. Subscription System

### `plans` — [BUILT] `infrastructure/db/schema/company.ts`

id, name, `monthly_price_usd`/`annual_price_usd` (nullable — null means "contact
sales," e.g. Enterprise has no fixed self-serve annual rate), `stripe_price_id`
(nullable — real payment collection is a separate, not-yet-built phase; see
docs/pricing-strategy.md), `max_seats` (nullable = unlimited), `max_datasets`,
`max_raw_records_per_month` ("data fetch limit" — raw records ingested per month,
every source kind), `max_leads_per_month` (unique leads identified per month,
post-dedup — a business-value metric distinct from the raw-fetch one),
`max_alert_rules` (nullable = unlimited), `max_apify_requests_per_month` (a distinct
infra-cost metric from raw records — pagination/probe calls cost API quota
regardless of how many records they return), `max_storage_kb`, `data_retention_days`,
`features` (jsonb, typed by `domain/billing/plan-features.ts::PlanFeatures` — a
closed set, not an open bag). Four real rows seeded by `infrastructure/db/seed.mjs`
(Starter/Professional/Business/Enterprise) — the plan catalog lives in the database,
not a hardcoded list, per this doc's own stated rule below.

### `subscriptions` — [BUILT] `infrastructure/db/schema/company.ts`

One per company (unique `company_id`), not one per user — the brief says "User
subscriptions" but a B2B SaaS bills the *company*, and individual users consume seats
under that one subscription (`plans.max_seats` is exactly this). A `user_subscriptions`
table would either duplicate the company's plan on every user row (denormalized,
goes stale) or just be `users` joined to `subscriptions` via `company_id` — already
possible with zero new tables. id, company_id (unique), plan_id, provider,
`provider_customer_id`/`provider_subscription_id` (nullable until billing is wired
up), status, seats, `current_period_start`/`end`.

### `limits` — [NOT RECOMMENDED as a separate table]

`plans.max_seats`/`max_datasets`/`max_leads_per_month`/`max_alert_rules`/
`data_retention_days` **are** the limits table. A separate `limits` table keyed by
`plan_id` would store the exact same columns under a different name — pure
duplication, the thing the brief explicitly says to avoid. If a limit ever needs to
vary *per company* rather than per plan (a negotiated enterprise override), the right
shape is a nullable override column on `subscriptions` that falls back to
`plans.max_*` when null — still not a new table.

### `usage_counters` — [BUILT] `infrastructure/db/schema/company.ts`, `application/billing/usage.ts`

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK | |
| metric | enum(`datasets`, `seats`, `leads_this_month`, `raw_records_month`, `apify_requests_month`, `storage_kb`) | |
| period_start | date | |
| period_end | date | |
| value | integer | |

One row per (company, metric, period) — `UNIQUE(company_id, metric, period_start)`.
In practice only the four monthly/high-volume metrics
(`leads_this_month`/`raw_records_month`/`apify_requests_month`/`storage_kb`) write
here — `datasets`/`seats` are small, infrequent, admin-driven writes checked via a
live `COUNT(*)` instead (see `application/billing/usage.ts::assertWithinLimit`), the
enum entries exist for documentation symmetry only. `storage_kb` is the one
cumulative (not monthly-flow) metric stored this way: bucketed by month like the
others (no schema change needed) but representing "KB added this month," with the
*total* used computed as a `SUM(...)` across every month recorded — cheap, since
there's at most one row per company per month regardless of ingested volume.

### `usage_events` — [NEW, optional]

id, company_id, metric, delta (`+1`/`-1`), occurred_at, metadata (jsonb — e.g. which
dataset triggered it). An append-only log `usage_counters` can be derived from.
**Recommendation: skip this table until there's a real need** (a billing dispute, a
"why did my seat count change" support question) — `usage_counters` alone is
sufficient for enforcement, and an unbounded event log is exactly the kind of table
that needs a retention policy from day one or it becomes the biggest table in the
database for no product value. Add it later if audit/proration needs it, not
speculatively.

---

## 4. Apify Integration

Every table in this section already exists — the brief's four categories map onto five
existing tables plus one genuinely new one (`api_requests`). This section is mostly
*mapping the requested names onto what's already there*, since building a second set
under the requested names would be the exact duplication the brief warns against.

### `sources` — [BUILT] `infrastructure/db/schema/catalog.ts`
A connector instance (company-scoped). id, company_id, kind
(`apify`\|`n8n`\|`webform`\|`manual`), name, config (jsonb), enabled.

### `datasets` — [BUILT] = "Data sources" / job *definition*
One upstream collection to track (an Apify dataset id), company-scoped, with an
adaptive `sync_interval_seconds` and `sync_cursor` watermark. This is the recurring
**job definition** — "keep polling this dataset" — not a single run.

### `sync_runs` — [BUILT] = "Scraping jobs" (the *execution*)
One row per actual sync attempt: trigger, status, items seen/new/updated, duration,
cursor before/after. **This is what "Scraping jobs" in the brief means concretely** —
the job *definition* is `datasets`, the job *execution history* is `sync_runs`.

### `sync_events` — [BUILT] = per-run structured log lines
Backs the admin log viewer — one row per log line within a `sync_run`, buffered and
flushed in batches (`application/sync/sync-logger.ts`) rather than one insert per
line, specifically to keep a chatty sync from spending more time logging than
ingesting.

### `dataset_versions` — [BUILT] = "Dataset history"
Immutable snapshot captured whenever a dataset's inferred schema fingerprint or item
count moves — schema fingerprint, field profile, diff against the previous version.
Exactly "dataset history": what shape did this dataset have, and when did it change.

### `raw_records` — [BUILT] = "Scraping results"
The verbatim upstream payload per item, keyed by `(dataset_id, source_item_id)`. This
*is* the scraping result — replay source of truth everything downstream (`leads`,
`lead_appearances`) is derived from.

### `api_requests` — [NEW]

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK | |
| source_id | uuid FK → sources | nullable |
| endpoint | text | e.g. `/v2/datasets/{id}/items` |
| method | text | |
| status_code | integer | |
| duration_ms | integer | |
| requested_at | timestamptz | |
| error | text | nullable |

The one real gap: `sync_runs`/`sync_events` are *job*-level (one row per sync attempt,
covering potentially many HTTP calls inside it); nothing currently logs the individual
Apify HTTP request/response. Useful for debugging Apify rate-limit exhaustion or
tracking API quota consumption independent of business outcome. **Recommendation:
short retention (7–30 days) or sample it** — this is operational telemetry, not
business data, and at any real request volume it becomes the single largest table in
the database for close to zero long-term value. Don't give it the same retention
posture as `raw_records`.

---

## 5. Customer Data

This is the section where "avoid duplicate data" matters most — the brief's six named
categories (`Leads`, `Contacts`, `Companies`, `Customer profiles`, `Validation
results`, `Lead scoring`) can very easily become six overlapping tables describing the
same underlying person three different ways. Here's the actual normalized shape.

### `leads` — [BUILT] `infrastructure/db/schema/leads.ts` = "Customer profiles"

One row per **person**, deduplicated across every source they were collected from.
Identity (`facebook_id`/`instagram_id`/`profile_url`/`username`), personal info
(name, avatar, location, bio, `contact` jsonb), business classification (`lead_type`),
AI rollup (`buyer_score`/`seller_score`/`investor_score`/`confidence_score`,
`ai_explanation`).

**"Customer profiles" is not a separate table — `leads` already is the customer
profile.** A second `customer_profiles` table storing the same person's name/contact/
classification would need to stay in lockstep with `leads` on every write or drift out
of sync — the definition of the duplicate-data problem the brief asks to avoid.

### `lead_appearances` — [BUILT] = the evidence trail behind each lead
One row per scraped item (post/like/comment) that contributed to a person's profile —
per-appearance classification (`intent`, `intent_score`, `score_reasons`), points at a
`canonical_appearance_id` when it's a detected repost.

### `lead_states`, `lead_events` — [BUILT]
`lead_states`: the human-owned side (status, assignee, notes, tags,
`first_contacted_at`) — keyed by person id, survives any reprocessing.
`lead_events`: append-only audit trail (`created`, `status_changed`, `assigned`,
`contacted`, `alerted`, ...).

### `Contacts` — [NOT RECOMMENDED as a table today; here's the upgrade path]

`leads.contact` (jsonb: `{ phone, email, whatsapp }`) already covers the common case —
0–3 contact methods per person, no per-method metadata needed. A dedicated table is
**only** worth it once contact data needs things jsonb can't express cleanly:
multiple values *of the same type* (two phone numbers), per-method verification state,
or a source/confidence per value. If/when that's real:

**`contact_methods` — [NEW, conditional]**

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lead_id | uuid FK → leads | |
| type | enum(phone, email, whatsapp, instagram, other) | |
| value | text | |
| is_primary | boolean | |
| verified_at | timestamptz | nullable |
| source | text | which appearance/dataset it was scraped from |

Migration path is clean (backfill from `leads.contact`, keep the jsonb column as a
denormalized "primary contacts" cache for the list view's fast path — same pattern
`leads.budget_min`/`max` already uses as a "most-recent-wins" cache over
`lead_appearances`' full history). **Don't build this until the jsonb shape actually
becomes a bottleneck** — it hasn't yet.

### `Companies` (target/prospect firms) — [NEW — genuinely new scope]

Unlike the other five items in this section, this one has **no existing equivalent** —
today's product is deliberately person-centric (a lead is a person, never a company —
see `docs/domain.md`). If the product is expanding into B2B firmographic tracking
(e.g. "this lead is a broker *at* Bali Villa Developers PT"), that's new scope, not a
rename of something that exists:

**`target_companies`** (named to disambiguate from the tenant `companies` table)

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies (tenant) | who discovered/owns this record |
| name | text | |
| domain | text | nullable |
| industry | text | nullable |
| size_range | text | nullable, e.g. `1-10`, `11-50` |
| location | text | nullable |
| source | text | which dataset/appearance surfaced it |
| created_at | timestamptz | |

**`lead_target_company_affiliations`** (many-to-many, not a single FK on `leads`)

| Field | Type | Notes |
|---|---|---|
| lead_id | uuid FK → leads | |
| target_company_id | uuid FK → target_companies | |
| role | text | `owner`\|`agent`\|`employee`\|`unknown` |
| started_at | timestamptz | nullable |
| ended_at | timestamptz | nullable, current if null |

A join table, not a single `leads.target_company_id` column, because a person's
professional affiliation can change (they move firms) and — less obviously — the same
person can legitimately be affiliated with more than one firm at once (an independent
broker representing several agencies). A single FK can't express either without
overwriting history.

### `Validation results` — [NEW — audit trail; distinct from what exists]

Today, validation is inline and stateless: `lead_appearances.is_spam` (boolean) and
`score_reasons` (jsonb — the phrases/signals behind a score) already explain *why* a
score landed where it did, computed fresh on every classification. What doesn't exist:
a durable record of validation *outcomes over time*, useful once there's more than one
validation stage (email-format check, phone-format check, duplicate-detection,
spam-classification) or once you need to answer "did this record ever fail
validation, and when did that change":

**`validation_results`**

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lead_appearance_id | uuid FK → lead_appearances | |
| validation_type | enum(`email_format`, `phone_format`, `duplicate_check`, `spam_classification`, `mapping_quality`) | |
| status | enum(`pass`, `fail`, `warning`) | |
| details | jsonb | |
| classifier_id | text | which classifier/rule version produced this |
| validated_at | timestamptz | |

**Recommendation: build this only if a multi-stage validation pipeline is actually
planned.** For the current single-pass rules classifier, `is_spam` +
`score_reasons` already say everything this table would say, with zero extra writes.
This table earns its cost once classifiers become swappable/versioned (the
`LeadClassifier` port already anticipates an LLM classifier eventually) and you need
to compare *which* classifier version flagged what, over time — see
`docs/tech-debt.md`'s LLM-classifier entry.

### `Lead scoring` — [BUILT, current-state-only] + [NEW, optional history]

Current scores already live on `leads` (`buyer_score`/`seller_score`/
`investor_score`/`confidence_score`, person-level rollup) and `lead_appearances`
(`intent_score`/`quality_score`, per-appearance). What's missing: **history** — every
`recompute_person_rollup` overwrites the previous score, so "is this lead getting
hotter or colder over time" can't be answered today.

**`lead_score_history` — [NEW, optional]**

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lead_id | uuid FK → leads | |
| buyer_score | integer | |
| seller_score | integer | |
| investor_score | integer | |
| confidence_score | integer | |
| classifier_id | text | |
| computed_at | timestamptz | |

Append-only, one row per rollup recompute. **Recommendation: build this once trend
reporting is an actual feature request** (a chart of "score over time" on the lead
detail view) — until then it's a write on every single ingest for a query nobody's
asking yet, which is the wrong tradeoff at this stage.

---

## Relationship Explanation (how it all connects)

```
companies (tenant)
  ├─< users ──1:1── profiles
  │     └─< user_roles >─< roles >─< role_permissions >─< permissions
  ├─< teams ──< team_members >── users
  ├──1:1── subscriptions ──< plans
  ├─< usage_counters
  ├─< sources ──< datasets ──< sync_runs ──< sync_events
  │                  │              └─< api_requests
  │                  ├─< dataset_versions
  │                  └─< raw_records ──1:1── lead_appearances
  ├─< leads (the person)
  │     ├─1:1── lead_states
  │     ├─< lead_events
  │     ├─< lead_appearances >── raw_records (see above)
  │     │       └─< validation_results
  │     ├─< contact_methods                      (optional, see above)
  │     ├─< lead_score_history                   (optional, see above)
  │     └─< lead_target_company_affiliations >── target_companies
  └─< alert_rules ──< alert_deliveries >── leads
```

**Every arrow in this diagram ultimately traces back to `companies`** — directly (a
`company_id` column) or transitively (through `datasets`→`sources`, or
`lead_appearances`→`leads`). That single-root-tenant shape is what makes the whole
schema's isolation story simple to reason about: one column to check, everywhere.

**Two deliberately different cardinalities worth calling out:**
- `leads` ↔ `target_companies` is many-to-many (`lead_target_company_affiliations`),
  not a single FK — a person's employer changes, and a person can represent more than
  one firm.
- `users` ↔ `roles` is many-to-many (`user_roles`), not a single FK, specifically so a
  future custom role can be *added* to a user without replacing their existing
  `users.role` fast-path value.

**One relationship intentionally does NOT exist**: nothing links `raw_records`
directly to `leads` — the path is always `raw_records` → `lead_appearances` →
`leads`. `lead_appearances` is what carries per-scrape classification; collapsing that
hop would mean a raw record could belong to more than one person's evidence trail with
no row to hold the classification that resolved it.

---

## Index Recommendations

Beyond what's already built (leads' composite identity indexes, GIN indexes on
arrays/full-text — see `infrastructure/db/schema/leads.ts`), the new tables above need:

| Table | Index | Why |
|---|---|---|
| `profiles` | PK on `user_id` (already 1:1) | no additional index — always looked up by the FK that's already the PK |
| `roles` | `(company_id, name)` unique | a company can't have two roles named the same; `company_id IS NULL` (system roles) excluded from the uniqueness via partial index, matching the existing `leads_company_facebook_id_key` pattern for nullable-scoped uniqueness |
| `role_permissions`, `user_roles` | composite PK doubles as the index | join tables read almost exclusively by their full key |
| `teams` | `(company_id, name)` unique | |
| `team_members` | `user_id` (in addition to the composite PK on `(team_id, user_id)`) | "which teams is this user on" is a real query the PK alone doesn't serve well |
| `usage_counters` | unique `(company_id, metric, period_start)` | this *is* the enforcement lookup — must be O(1), not a scan |
| `api_requests` | `(company_id, requested_at)`, `(source_id, requested_at)` | time-range queries are the only access pattern; no full-table scan on this one, it grows fast |
| `contact_methods` | `(lead_id)`, and `(type, value)` **not** unique globally — the same phone number can legitimately belong to two different scraped identities before a human resolves it, don't over-constrain | |
| `target_companies` | `(company_id, domain)` where `domain IS NOT NULL` | dedup signal — two appearances mentioning the same domain should resolve to one target company |
| `lead_target_company_affiliations` | `(lead_id)`, `(target_company_id)` | both directions get queried — "who works here" and "where has this person worked" |
| `validation_results` | `(lead_appearance_id, validation_type)` | "has this appearance's email ever failed validation" is the shape of query this serves |
| `lead_score_history` | `(lead_id, computed_at DESC)` | trend queries always want "this lead's history, most recent first" |

**General principle already established in this codebase and worth restating**:
partial indexes (`WHERE x IS NOT NULL`) wherever a column is optional but needs
uniqueness among the rows that *do* have a value — `leads`' own identity indexes
already do this (`leads_company_facebook_id_key ... WHERE facebook_id IS NOT NULL`).
Every new nullable-but-sometimes-unique column above should follow the same shape,
not a plain unique index that would reject a second `NULL`.

---

## Data Storage Strategy

**Hot vs. cold data, and what that means per table**:
- **Hot, read every request**: `users`, `companies`, `subscriptions` — small tables,
  read on every authenticated request, should stay narrow (this is the `profiles`
  split's whole justification).
- **Hot, read every page load**: `leads`, `lead_states`, `datasets` — the actual
  product surface. Already covered by Cache Components (`"use cache"` +
  `cacheTag`/`cacheLife`, see architecture.md's Performance section) — nothing new
  needed here, the pattern already scales by adding a tag, not a schema change.
- **Warm, written often, read occasionally**: `lead_appearances`, `sync_runs`,
  `usage_counters` — write-heavy, read on-demand (detail views, admin dashboards).
- **Cold, append-only, time-bounded value**: `sync_events`, `lead_events`,
  `api_requests`, `usage_events` (if built), `validation_results` (if built),
  `lead_score_history` (if built). These should all have an explicit retention policy
  from day one, following the precedent `application/maintenance/prune-old-rows.ts`
  already sets for `sync_events`/`login_attempts` — don't let any of them grow
  unbounded on the assumption "we might need it later." `lead_events` is the one
  deliberate exception (funnel-analytics source of truth, kept forever by design).

**Denormalization that's already correct, and the pattern to keep following**:
`leads.budget_min`/`max`/`currency` cache the *most recent* appearance's stated
budget rather than requiring a join to `lead_appearances` on every list-page render.
`leads.contact` is the same idea for contact info. This is the right general shape
for any "customer profile" field: keep a cheap denormalized cache on `leads` for
whatever the list/card view needs at a glance, keep the full normalized history one
join away (`lead_appearances`, or `contact_methods`/`lead_score_history` if those get
built) for anything that needs the complete picture. Don't denormalize speculatively
onto a hot table before a real read pattern demands it — every example of this in the
existing schema was added because a specific page needed it fast, not preemptively.

**Partitioning / scale ceiling** — not needed yet, but the plan if `lead_appearances`
or `raw_records` grow an order of magnitude: range-partition by `company_id` (natural
tenant boundary, and old-company data is colder) or by `posted_at`/`first_seen_at`
(time-based, matches the retention-policy tables above). Postgres native partitioning
can be introduced later without an application-code change, since every query already
filters by `company_id` — partitioning is a storage-layer decision that would ride on
indexes/filters already in place, not a reason to change anything now.

**What NOT to do, restated from the tables above**: don't add `customer_profiles`
(that's `leads`), don't add a generic `limits` table (that's `plans.max_*`), don't
build `usage_events`/`validation_results`/`lead_score_history`/`workspaces` until a
concrete feature needs them — every one of those is cheap to add later and expensive
to carry unused from day one.
