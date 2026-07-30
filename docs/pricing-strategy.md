# Subscription & Pricing Strategy

**Status: built.** Schema (`infrastructure/db/schema/company.ts`'s `plans`/`subscriptions`/
`usage_counters`), tracking (`application/billing/usage.ts`), enforcement (same file,
plus the connector/sync-engine wiring below), and the upgrade/downgrade flow
(`application/billing/plan.actions.ts`) all exist and are tested. **Not built**: real
payment collection (Stripe) — see "What's deliberately not built" at the bottom.

## 1. Plan structure

Four tiers, seeded by `infrastructure/db/seed.mjs` (the single source of truth for plan
data — "config lives in the database," not a hardcoded catalog, matching this
codebase's existing rule). Every limit lives on the `plans` row; changing one is an
admin edit, not a deploy.

| Limit | What it actually measures | Why it's a separate dimension |
|---|---|---|
| **Seats** (`maxSeats`) | Team members in the company | Classic per-user SaaS lever |
| **Datasets** (`maxDatasets`) | Connected, non-archived data sources | Each one is an ongoing Apify/n8n integration to maintain |
| **Data fetch limit** (`maxRawRecordsPerMonth`) | Raw records ingested per month, every source kind (Apify, n8n, webform, manual) | The volume metric — how much the pipeline actually processes, before any dedup |
| **Leads identified** (`maxLeadsPerMonth`) | Unique buyer/seller people identified per month, *after* dedup | A business-value metric, not a raw-volume one — this is what the customer is really paying for |
| **Alert rules** (`maxAlertRules`) | Configured alert rules | Cheap to raise; a low-friction upsell lever |
| **Apify requests** (`maxApifyRequestsPerMonth`) | Apify API calls per month | A distinct infra-cost driver from "data fetch" — pagination and probe calls cost API quota regardless of how many records they return |
| **Storage** (`maxStorageKb`) | Cumulative raw-record payload size on disk | The other real infra-cost driver; grows forever within a plan unless data is pruned |
| **Data retention** (`dataRetentionDays`) | How long the plan's data-retention policy keeps rows | Not separately enforced by a job yet — see docs/tech-debt.md |

`maxSeats`/`maxAlertRules` are **nullable** — `NULL` means unlimited, deliberately only
for these two. "Unlimited team members" is Enterprise's actual, meaningful selling
point; alert rules are cheap to allow without limit. Every other limit stays finite
even at Enterprise, because Apify requests, storage, and record volume map to real,
per-unit infrastructure cost — a true "unlimited" there is a real liability, not a
marketing line. This is why `changePlan`'s downgrade check (§4) only ever needs to
special-case `null`, never assume every limit behaves the same way.

### The four tiers

| | **Starter** | **Professional** | **Business** | **Enterprise** |
|---|---|---|---|---|
| Price (mo / yr) | $49 / $470 | $149 / $1,430 | $399 / $3,830 | from $999 / custom |
| Seats | 3 | 10 | 25 | Unlimited |
| Datasets | 3 | 10 | 30 | 100 |
| Data fetch (records/mo) | 5,000 | 25,000 | 100,000 | 500,000 |
| Leads identified/mo | 1,000 | 5,000 | 20,000 | 100,000 |
| Alert rules | 5 | 25 | 100 | Unlimited |
| Apify requests/mo | 5,000 | 25,000 | 100,000 | 500,000 |
| Storage | 500 MB | 5 GB | 25 GB | 100 GB |
| Retention | 90 days | 180 days | 365 days | 730 days |

Every annual price is roughly 20% off twelve months of the monthly price — a standard
cash-flow-now-for-a-discount trade that also lowers churn (an annual customer can't
cancel mid-year on a whim).

## 2. Feature comparison

`plans.features` (jsonb, typed by `domain/billing/plan-features.ts::PlanFeatures`) is a
closed set, not an open bag — every flag gates a real code path, or is explicitly
marked display-only until one exists:

| Feature | Starter | Professional | Business | Enterprise | Enforced? |
|---|---|---|---|---|---|
| WhatsApp alerts | – | ✅ | ✅ | ✅ | Not yet — flag exists, alert dispatch doesn't check it yet (see below) |
| AI-assisted classification | – | – | ✅ | ✅ | Not yet — same as above |
| Custom branding | – | – | ✅ | ✅ | Display-only (no code path) |
| Priority support | – | ✅ | ✅ | ✅ | Display-only (support is a process, not code) |
| SSO | – | – | – | ✅ | Display-only (SSO isn't built) |

Honesty matters more than a longer feature list: `hasFeature()` exists and the flags
are seeded, but wiring `whatsappAlerts`/`llmShadowClassify` into
`application/alerting/dispatch.ts` and `infrastructure/ai/llm-classifier.ts`
respectively is a small, well-scoped follow-up (check `hasFeature(plan.features,
"whatsappAlerts")` before allowing a `whatsapp`-channel alert rule; check the
per-company flag alongside the existing global `LLM_SHADOW_CLASSIFY_ENABLED` kill
switch) — not done in this pass because it touches the alerting/classification
pipelines rather than the billing system itself. `customBranding`/`prioritySupport`/
`sso` are sold today the same way many SaaS companies sell them before the
engineering catches up: as a commitment on the pricing page, fulfilled operationally
(a support process, a manual white-label config) rather than a feature flag.

## 3. Usage tracking system

Two shapes, both in `application/billing/usage.ts`:

- **Live count** (`assertWithinLimit`) — for `seats`/`datasets`. Both are small,
  infrequent, admin-driven writes (tens, not thousands, of rows), so a plain
  `COUNT(*)` at write time is cheap and can never drift from reality.
- **Aggregate counter** (`usage_counters` table) — for everything high-volume:
  `leads_this_month`, `raw_records_month`, `apify_requests_month`, `storage_kb`. Each
  is incremented in place (`incrementMonthlyLeadUsage`/`incrementRawRecordUsage`/
  `incrementApifyRequestUsage`/`incrementStorageUsage`), never recomputed from a full
  table scan. All four share one rule: **a usage-tracking failure must never break
  the operation it's measuring** — every increment function swallows its own error
  into a warning log, same as the codebase's existing `api_requests` audit log.

  `storage_kb` is the one cumulative metric stored in an otherwise-monthly table: it's
  bucketed by month (same unique index as the others, no schema change needed) but
  represents "KB added this month," and the *total* used is a `SUM(...)` across every
  month ever recorded — cheap, since there's at most one row per company per month
  regardless of how much data has been ingested.

Real call sites, not aspirational ones:

- `infrastructure/apify/apify.connector.ts::logApiRequest` increments
  `apify_requests_month` next to its existing `api_requests` audit-log insert, on
  every HTTP attempt (including retries — a retried call really did cost API quota).
- `application/sync/sync-dataset.ts::syncDataset` increments `raw_records_month` by
  every item seen in a page (new or updated — the upstream source was queried for all
  of it) and `storage_kb` by the byte size of *newly inserted* rows only (an
  `onConflictDoUpdate` overwrite doesn't meaningfully grow storage the way a fresh row
  does).
- `application/leads/identity-resolution.ts::resolveIdentity` increments
  `leads_this_month` only when a genuinely new person is created, never on a merge
  into an existing one (pre-existing, unchanged by this work).

## 4. Limit validation system

Two different failure modes for two different contexts:

- **User-facing action, synchronous throw**: `assertWithinLimit(companyId, "seats" |
  "datasets")` throws `LimitExceededError` with a message the UI surfaces directly
  (`application/auth/invite.actions.ts`, `application/teams/team.actions.ts` and
  friends already call this). Right call here — a person is waiting on this request
  and should see why it failed.
- **Background cron context, non-throwing check**: `isWithinMonthlyBudget(companyId,
  "rawRecords" | "apifyRequests")` returns a plain `boolean`, checked once at the top
  of `syncDataset` — before the probe call even fires, so a company already over
  budget spends zero additional Apify requests finding that out. An uncaught throw
  here would fail an entire cron tick (`app/api/trigger/sync/route.ts` loops over
  every due dataset across every company); "skip this dataset, log why, keep going"
  is the only sane behavior for a scheduler.

Both share `getCompanyPlan()`'s degrade rule: a company with no subscription row
(shouldn't happen post-signup, see §5) is treated as **unenforced**, not locked out —
missing billing plumbing must never be the reason a customer's data stops flowing.

## 5. Upgrade/downgrade flow

`application/billing/plan.actions.ts`:

- **Every company gets a real subscription from the moment it exists.**
  `application/auth/signup.actions.ts::signUp` now creates a `subscriptions` row on
  the seeded "Starter" plan, status `trialing`, in the same transaction as the
  company and its owner — closing a real gap where new signups previously had *no*
  subscription row at all, and therefore no limits enforced whatsoever.
- **`changePlan`** is owner-only (`ownerActionClient` — a spend decision, not a "manage
  users and settings" one; see `domain/auth/permissions.ts`'s role split). The safety
  rule needs no explicit "upgrade vs. downgrade" concept at all: **a switch is allowed
  iff current usage already fits inside the target plan's limits.** An upgrade only
  raises limits, so it always passes automatically; a downgrade is exactly the case
  this catches. Only *stock* metrics are checked (seats, datasets, alert rules,
  storage — quantities that exist right now); monthly *flow* metrics (leads/records/
  Apify-requests this month) are deliberately not checked, because they're
  already-spent consumption under the old budget, not a standing violation — the new,
  smaller monthly budget simply applies starting now, same as a real Stripe plan
  change. `validatePlanChange` is split out as a plain, directly-testable function
  (see `plan.actions.integration.test.ts`) — the action itself is a thin wrapper:
  auth, lookup, validate, write.
- **No proration.** A switch takes effect immediately, at the new plan's list price,
  starting the next billing cycle conceptually — there's no partial-period credit/
  charge logic, because there's no real payment processor to reconcile against yet.
  Add proration when Stripe is wired (§ below); until then it would be bookkeeping
  with nothing to book against.
- **The public pricing page** (`/pricing`) reads live from `listPlans()` — the exact
  same DB rows the admin billing page and the enforcement code use, so the marketing
  page can never drift from what's actually enforced.

## 6. Recommended pricing strategy — the business reasoning

**Cost-basis floor.** The two hard infra-cost drivers are Apify API usage (billed
per-request/compute-unit by Apify) and Postgres storage. Starter's 5,000
requests/month and 500 MB roughly bound worst-case infra cost per Starter customer to
a few dollars — at $49/mo that's comfortably >80% gross margin even before
accounting for the fact that most customers won't touch their ceiling. Every tier
above scales requests/storage/records *faster* than price (e.g. Business is 8x
Starter's price but 20x its request budget) — this is deliberate: heavier users are
disproportionately Apify/storage-cost-driven, not seat-driven, so pricing needs to
capture that or margin erodes exactly on the customers using the product most.

**Per-seat vs. per-usage, hybridized.** A pure per-seat model (like most B2B SaaS)
under-charges a 3-person team running 50 datasets around the clock, and a pure
usage-based model punishes a growing team for succeeding. Gating on *both* seats and
data volume — with data volume the more aggressively-scaled axis — means a customer's
bill grows with the dimension that actually costs money to serve, while the seat
count stays a secondary, cheap-to-raise lever (this is also why alert rules and seats
are the two "unlimited-at-Enterprise" limits: neither meaningfully drives cost).

**The anchor/decoy effect: Business is the intended default.** Three visible,
increasingly-generous mid-tiers plus a "contact us" top tier is a deliberate
structure — Professional exists partly to make Business look like the obviously
correct choice (2.7x the price for 4x the datasets, 4x the requests, 4x the leads),
and Enterprise's "custom pricing" framing removes sticker-shock from anchoring the
whole page around Business rather than Starter. The pricing page marks Business as
the visually highlighted tier for exactly this reason.

**Annual discount ≈ 20%, not more.** Deep annual discounts (30%+) train customers to
never buy monthly and compress cash flow benefit without proportionally reducing
churn risk. ~20% is enough to meaningfully shift new signups toward annual (better
cash flow, lower churn) without giving away a quarter of a year's revenue for a
commitment that isn't that much stickier at 20% than at 30%.

**14-day trial, credit-card-optional.** Real estate agencies are a slower-moving,
relationship-driven buyer than a typical self-serve SaaS audience — a longer trial
than the "startup default" 7 days gives a prospective customer time to see real buyer
leads surface, not just poke at the UI. No card required lowers the barrier to trying
it at all, at the cost of some trial-to-paid conversion rigor; this is the right
trade for a product whose value (a qualified buyer lead) takes days, not minutes, to
demonstrate.

**Enterprise is deliberately under-specified.** "Starting at $999/mo, contact sales"
signals seriousness (this isn't a $49 upsell) without competing on a published number
against whatever a large brokerage's procurement team wants to negotiate — real
Enterprise deals in this space are won on relationship, SLA, and custom integration
scope, not sticker price.

## What's deliberately not built

- **Real payment collection.** `plans.stripePriceId` exists so wiring Stripe later is
  additive (an ID on an existing row), not a migration. `changePlan` updates
  `subscriptions.planId` directly — a real integration would instead redirect to
  Stripe Checkout (new subscription) or the Stripe Customer Portal (existing
  subscription's plan change), with a webhook updating `subscriptions` on the actual
  payment event, matching the `subscriptions` table's existing "mirrors Stripe, isn't
  the system of record" design (docs/saas-platform-architecture.md §5). No Stripe
  account/API keys were available to build against in this pass.
- **Proration** — see §5.
- **`whatsappAlerts`/`llmShadowClassify` enforcement** — flags exist and are sold, the
  two small call-site checks that would enforce them are a follow-up (§2).
- **Storage counter decrement on delete/prune** — `storage_kb` only grows; see
  docs/tech-debt.md.
