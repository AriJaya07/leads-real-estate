# Known Tech Debt

## `storage_kb` usage counter only grows — nothing decrements it on delete/prune

`incrementStorageUsage` (`application/billing/usage.ts`) adds to a company's storage
counter every time a sync ingests new raw records, but nothing subtracts from it when
`application/maintenance/prune-old-rows.ts` (or a manual dataset/company deletion)
removes rows. Over a long enough time horizon a company's *reported* storage usage
will overstate what's actually on disk, eventually blocking a plan downgrade
(`application/billing/plan.actions.ts::changePlan`) that would otherwise be valid.
Low urgency: storage limits are generous (see docs/pricing-strategy.md) and retention
pruning is itself a slow, bounded process — revisit by adding a matching decrement in
the retention job once real customers are hitting storage ceilings, or replace the
incremental counter with a periodic recompute (`SUM(octet_length(payload))` over
`raw_records`) if drift becomes a real problem.

## Multi-tenant isolation is app-layer only — no Postgres RLS yet

Every query in `application/` is scoped by `companyId` (audited file by file, proven by
`e2e/multi-tenant.spec.ts` — see docs/saas-platform-architecture.md), but there is no
database-level backstop: `infrastructure/db/client.ts`'s `db()` is a single shared
connection-pool singleton with zero per-request scoping, so a real Postgres
Row-Level-Security policy would need `SET LOCAL app.current_company_id` inside a
per-request transaction — a structural change to `db()`'s contract touching every one
of the ~20 files that import it directly, deliberately not attempted in the same pass
as the query-scoping audit itself (see the retrofit's plan). Until this exists, a
*new* query added later that forgets its `companyId` condition fails open (returns
cross-tenant data) rather than failing closed. Revisit once there's a concrete need
for defense-in-depth beyond "every query was audited once" — e.g. before onboarding a
customer with real compliance requirements.

## `/admin/sync`'s activity feed can show stale data right after a triggered sync — pre-existing, not tenant-scoping related

Found while verifying the multi-tenant retrofit's `e2e/sync-activity.spec.ts`, confirmed
unrelated to `companyId` scoping: `getRecentSyncRuns`/`getSyncOverview`
(`application/datasets/dataset-queries.ts`) are correct — a raw SQL query with the exact
same `WHERE company_id = ...` clause returns the just-completed run immediately after
`runSync` commits. The UI still shows "No sync runs yet," because the sidebar's `next/link`
to `/admin/sync` (viewport-triggered automatic prefetch, per architecture.md's Navigation
section) renders and caches that page **before** the sync starts — confirmed by timestamp:
the cached `getRecentSyncRuns` call logged ~1.5s earlier than the `sync_runs` row's own
`started_at`. `runSync`'s `updateTag(datasetsRegistryTag())`/`updateTag(leadsTag())` calls
(unchanged by this retrofit) don't appear to reach that prefetched cache entry, so
navigating to `/admin/sync` right after triggering a sync reuses the stale empty result —
even across a full page reload, so it isn't purely a client-side prefetch cache either.
Not fixed here: root-causing it needs reading `node_modules/next/dist/docs/` on this Next
16 version's exact prefetch + `"use cache"` + `updateTag` interaction (per AGENTS.md), which
is a different, pre-existing class of bug from anything this retrofit touched — the
underlying data layer is provably correct. Reproduce with `npx playwright test
e2e/sync-activity.spec.ts`.

## ~~`[object Object]` rendering in the lead detail sheet's passthrough attributes~~ — fixed

`features/leads/components/lead-detail-sheet.tsx`'s "Source fields" panel rendered
arbitrary passthrough `attributes` values with `String(value)`, which renders the
literal text `[object Object]` for any attribute whose raw shape is an object or array
(a real risk for nested payload fields like Facebook's `attachments[].photo_image`).
Replaced with `formatAttributeValue` (arrays join, objects `JSON.stringify`, primitives
`String`). Confirmed via review, not a hypothetical — see
[docs/lead-source-scaling-plan.md](lead-source-scaling-plan.md).

## No curated mapping profile exists yet for a real engagement-shaped actor

`recordKind` (`engagement_like`/`engagement_comment`) and its scoring/dedup branches are
built and tested (`domain/scoring/rules-classifier.test.ts`,
`application/leads/process-records.integration.test.ts`), but no curated mapping
profile claims a real "Post Likers"/IG-likers Apify actor's output yet — there's no
verified payload sample to write `matchPaths` against, and per architecture.md's
"curated beats auto-proposal" rule, a guessed-at profile is worse than none. Adding one
is an `/admin` mapping-profile edit once such an actor is actually wired up on the n8n
side (see the "buyer-side data collection" gap below) — not a code change.

## React Query staleness on background (non-actor) changes to leads/datasets

`revalidateTag(tag, "max")` from the Apify webhook invalidates the
RSC tag cache in the background, which is correct for that cache — nobody's actively
waiting on a webhook-triggered write. But a browser tab with `/leads` or the topbar
already open won't see that change until React Query's own `staleTime` elapses and a
refetch is triggered (window refocus, remount, or the next explicit
`invalidateQueries` call from a user-initiated mutation): 30s for the leads list
(`shared/query-client.ts`'s default), 60s for facets/stats/datasets
(`features/leads/queries.ts`, `features/datasets/queries.ts` set this explicitly —
matched to those same functions' server-side `"use cache"` 1-minute `revalidate`
window, see architecture.md's Performance section, so the client isn't polling faster
than the data underneath it actually changes). This is an accepted convergence lag,
not a bug — the same trade-off the tag cache already made explicitly for background
revalidation. If that lag ever needs to shrink for a live-updating surface, the fix is
a shorter `staleTime` on the specific query (and a shorter `cacheLife` on its
server-side counterpart), not a global one.

## ~~Admin table row memoization (`DatasetTable`, `TeamTable`) not applied~~ — fixed

`LeadInbox`'s row components (`LeadCard`, `LeadRow`) are `React.memo`'d because
`isFetching`/`isPlaceholderData` toggling is a *wrapper*-level state change — every row
was re-rendering for a prop set that hadn't actually changed. `DatasetTable` had the
same shape (`busyId` state, one row's `disabled={busyId === dataset.id}` flips while
every other row's `disabled` prop evaluates to the same `false` before and after) —
its `DatasetRow` is now memoized the same way, as is `ActorTemplateManager`'s
`TemplateRow` (`features/collection/components/actor-template-manager.tsx`), which has
the identical `busyId`-toggle shape. `TeamTable` doesn't have this issue at all — its
`busy` flag legitimately changes every row's `disabled` prop simultaneously, so
memoizing its rows wouldn't skip any work; left un-memoized deliberately, not an
oversight.

## `facetsTag()` (`application/cache-tags.ts`) is defined but unused

`getLeadFacets`/`getDynamicAttributeFacets` (application/leads/facets.ts) are cached
with `"use cache"` tagged `leadsTag()`, not the narrower `facetsTag(datasetId)` that
already existed in the tag vocabulary. Reason: no mutation site knows a lead's
`datasetId` without an extra lookup (`lead.actions.ts`'s `invalidate(leadId)` only has
the lead id), so wiring the narrower tag would mean adding a dataset lookup to every
lead mutation for a cache-precision win that isn't needed yet — invalidating all facets
on any lead change (the `leadsTag()` behavior) is already correct, just slightly
broader than strictly necessary. Revisit if per-dataset facet invalidation ever needs
to be more surgical (e.g. once there are enough datasets that a global facets
invalidation becomes a measurable cost).

## ~~`/pipeline`, `/intelligence`, `/admin/sync` are placeholders, not 404s~~ — fixed

`/pipeline` is a kanban board (`features/pipeline/components/pipeline-board.tsx`) —
one column per `PIPELINE_STATUS`/`TERMINAL_STATUS`, each backed by `useLeadsQuery` with
a different `status` filter, native HTML5 drag-and-drop plus a keyboard-accessible
status/assignee `<select>` per card (`setLeadStatus`/`assignLead`/`toggleBookmark`, all
previously unwired — see the entry this replaces). `/intelligence` aggregates
`getLeadStats`, a new `getLeadTrend`/`getBudgetStats` pair, and the existing
`getLeadFacets` (reused as-is for intent/location/property-type/source breakdowns —
no new facet query needed) into stat tiles and hand-rolled SVG-free bar charts
(`features/intelligence/components/`). `/admin/sync` is both halves the previous entry
called out: a cross-dataset activity feed (new `getRecentSyncRuns`) at `/admin/sync`,
and a per-dataset detail view at `/admin/sync/[datasetId]` built on the
already-existing-but-unused `getDatasetDetail`/`getSyncEvents`, with `configureSync`/
`acceptSchemaVersion`/`approveMappingProfile` (also previously unwired) now live there.

One real bug found building this: `getSyncOverview`/`getRecentSyncRuns` are read by
Suspense-child components that take no props and call no dynamic API
(no `searchParams`/`cookies`) — under Cache Components that makes them eligible to be
baked into the static build shell and never re-execute per request, unlike every other
prefetched read in this app (which all sit downstream of an awaited `searchParams`).
Fixed by giving both `"use cache"` + the same tags `runSync`/`setDatasetStatus` already
invalidate — caught by an e2e test that triggers a sync and expects to see it in the
feed immediately, not just "eventually."

## ~~Duplicated ranking formula (SQL vs. TypeScript)~~ — fixed

`domain/lead/ranking.ts` now exports its weights (`BUYER_SCORE_WEIGHT`,
`CONFIDENCE_WEIGHT`, `NON_BUYER_SCORE_WEIGHT`, `RECENCY_HALF_LIFE_HOURS`) instead of
inlining them, and `application/leads/priority-sql.ts::prioritySortExpression()` builds
the `ORDER BY` SQL from those same constants — one formula, two consumers.
`lead-queries.ts` just calls the builder now. Still deliberately omits the
`hasContact`/`alreadyWorked` display-only multipliers from the SQL side (a secondary
tie-break, not the primary sort key) — see the comment on `prioritySortExpression` if
that gap ever needs closing.

Building this surfaced a real bug worth remembering: interpolating a bare JS number like
`0.7` into a Drizzle `sql` template lets Postgres infer the parameter's type from
surrounding context — multiplying against the integer `buyer_score` column made it
infer `integer`, and binding `0.7` failed outright with `invalid input syntax for type
integer`. Every weight is now explicitly cast (`::numeric`).
`application/leads/priority-sql.test.ts` only compiles the SQL and never caught this;
the e2e suite hitting a real database did. That gap — a unit test compiling a query vs.
actually executing it — is exactly why the integration/e2e tiers exist; see
[testing-strategy.md](testing-strategy.md).

## `guessBody`/`guessItemId` heuristics run before a mapping profile exists

`application/sync/sync-dataset.ts` has to compute a `contentHash` and stable
`sourceItemId` for brand-new datasets *before* any mapping profile has been
approved — see `guessBody`/`guessItemId`. These are best-effort field-name guesses
(`text`, `message`, `content`, `caption`, `description`, `body` / `id`, `postId`,
`legacyId`, `itemId`, `uuid`), not the same resolution logic as `applyMapping`. A
dataset whose real body/id field uses a name outside this list will get a
worse-than-ideal `contentHash` (falls back to `JSON.stringify(payload)`) until a mapping
profile is approved and things reprocess. Low risk in practice (the whole point is these
run once, briefly, before a curated/auto profile takes over) but worth knowing if
dedup looks wrong for a dataset that was very recently discovered.

## ~~Auto-approved mapping profiles are a silent risk~~ — mitigated, not eliminated

Auto-generated mapping profiles with confidence ≥ `MAPPING_AUTO_APPROVE_CONFIDENCE`
(0.8) are still approved and applied with zero human review — that tradeoff is
intentional (see `architecture.md`'s "curated beats auto-proposal" decision) and hasn't
changed. What's new: `domain/dataset/mapping-quality.ts::assessMappingQuality`, wired
into `syncDataset`, checks the *first batch* such a profile produces. If ≥5 records come
through and more than 60% land `isSpam` or more than 50% have an empty `body`, the
profile's `approvedAt` is revoked (set back to `null`) and a `sync_events` warning is
logged — the next sync then treats it as "awaiting admin approval" like any other
unreviewed proposal, and stops normalizing through it.

This is a backstop, not a guarantee: it only inspects the *first* batch (a mapping that
starts fine and degrades later — e.g. the upstream shape drifts again — isn't caught by
this check; that's what schema-drift detection is for), and the 60%/50% thresholds are
flat heuristics, not adaptive to a given source's normal baseline. See
`domain/dataset/mapping-quality.test.ts` and
`application/sync/sync-dataset.integration.test.ts`'s
"auto-approved mapping profile quality guardrail" suite for the exact behavior.

**Now `recordKind`-aware.** The empty-body check is skipped entirely for
`engagement_like`/`engagement_comment` profiles — an engagement record is *supposed* to
have no body, so without this the guardrail would have revoked every liker mapping
profile's approval on its first sync. The spam-rate check still applies unconditionally
(currently a no-op for engagement records, since `classifyEngagement` never sets
`isSpam`, but left in place in case that changes).

## Appearance-level duplicate detection is same-source-kind agnostic but not cross-dataset budget-aware

`findCanonicalDuplicate` in `application/leads/process-records.ts` matches on trigram
body similarity + optional `authorExternalId` within a 72-hour window
(`NEAR_DUPLICATE_WINDOW_HOURS`), scoped to `lead_appearances.body` globally — not scoped
to `datasetId`. This is deliberate (the same post can be scraped into two different
datasets, e.g. Facebook and Instagram mirrors of the same content) but means a
`similarity()` GIN-trigram scan runs across the whole `lead_appearances` table on every
new record. At current volumes this is fine; if appearance volume grows an order of
magnitude, this query is the first place to look for a performance regression. Note this
is *appearance*-level repost detection (same text posted twice), a different and
narrower mechanism than person-level identity merge — two differently-worded posts from
the same `authorExternalId` already resolve to one person via `resolveIdentity`
regardless of what this query finds.

**`engagement_*` records no longer go through this path at all — fixed.** They used to:
the `body.trim().length >= 40` gate meant an engagement record's always-empty body never
qualified for the similarity check, so every resync of the same like produced a second,
undeduped appearance. `findEngagementDuplicate` now handles `recordKind !==
"content_post"` separately — an indexed `(authorExternalId, targetPostExternalId)`
equality lookup (backed by `lead_appearances_engagement_author_idx`), cheaper than the
trigram scan, not scoped to `datasetId` for the same cross-mirror reason as above. See
[docs/lead-source-scaling-plan.md](lead-source-scaling-plan.md).

## ~~FX rates have a hardcoded fallback table, never refreshed~~ — fixed

`FALLBACK_USD_RATES` in `application/leads/process-records.ts` is still there as a
last-resort default, but `fx_rates` is no longer seed-once-and-forget.
`application/fx/refresh-fx-rates.ts` refreshes every currency already tracked in
`fx_rates` from `infrastructure/fx/fx-rate.provider.ts` (ECB rates via
frankfurter.dev, free, no API key). A failed refresh — network error, upstream shape
change — leaves the existing rows untouched and logs via the structured logger rather
than throwing; budget filtering degrades to "stale" in that case, never to "broken."
Nothing calls this on a schedule today — see "no scheduled trigger" below.

## LLM classifier is shadow-mode scaffolding only — rollup still has no second implementation

`infrastructure/ai/llm-classifier.ts` now implements `domain/scoring/types.ts::LeadClassifier`
(`LLM_CLASSIFIER_ID = "llm@shadow-1"`) via the Anthropic Messages API, and
`application/leads/shadow-classify.ts::runShadowClassification` fires it alongside
`classifyWithRules` (`RULES_CLASSIFIER_ID = "rules@2"`) from `process-records.ts`,
purely for comparison logging — gated behind `LLM_SHADOW_CLASSIFY_ENABLED` +
`ANTHROPIC_API_KEY`, both optional and off by default, so this is a no-op for any
deployment that hasn't opted in. Nothing persists the LLM result anywhere and there is
no cutover path — the rules classifier remains the only thing that ever determines a
persisted `lead_appearances.intent`/score. Before anyone considers a cutover: the
shadow logs need to actually be evaluated against real lead volume, which hasn't
happened yet (this scaffold shipped with no production traffic to compare against).

`domain/scoring/lead-rollup.ts::LeadIntelligence` (`RULES_ROLLUP_ID = "rules-rollup@1"`)
still has no second implementation — only the appearance-level classifier got a
scaffold this round. An engagement-only lead (no body text anywhere) is the concrete
case where an LLM rollup would earn its keep first — see domain.md's "AI analysis"
section.

## `buyerScore`/`sellerScore`/`investorScore`/`confidenceScore` are first-pass heuristics, not calibrated

`domain/scoring/lead-rollup.ts::rollupPersonScores`'s diminishing-returns sum, the
15-point `leadType` floor, and `confidenceScore`'s appearance-count/corroboration/
contactability weights are reasonable starting points, not values tuned against real
conversion data — same posture as the rules classifier's phrase weights when it
shipped. Worth revisiting once there's enough real lead volume to check whether
`leadType`/score thresholds actually track which leads convert.

## No person-level spam suppression yet

A person whose *only* appearances are all spam-flagged still gets a `leads` row —
their `buyerScore`/`sellerScore`/`investorScore` all stay 0 (spam appearances are
excluded from `recomputePersonRollup`'s rollup query), so they sink to the bottom of
any score-ordered view and never clear an alert threshold, but there's no hard filter
hiding them from `/leads` entirely the way `includeSpam` used to gate the old per-post
inbox. Revisit if this turns out to be more than a cosmetic nuisance at real volume —
the fix would be a computed "has any non-spam appearance" flag or facet, not a new
per-appearance concept.

## `lead_events`'s `merged` type isn't written yet

`leadEventTypeEnum` has included `merged` since before this table was person-centric,
intended for an audit trail of identity-resolution merges ("appearance from post X
merged into existing person Y because facebookId matched"). `resolveIdentity`
(`application/leads/identity-resolution.ts`) doesn't write one yet — there's no way to
answer "why did these two appearances end up as the same lead" from the UI today beyond
inspecting `facebookId`/`instagramId`/`profileUrl` directly. Worth adding once someone
actually needs to debug a merge decision.

## ~~No coverage/CI gate~~ — fixed

`.github/workflows/ci.yml` runs four jobs on every PR and push to `main`: `static`
(typecheck + lint), `unit` (`npm test`), `integration` (`npm run test:integration`
against a Postgres service container), and `e2e` (build + `npm run test:e2e` via
Playwright, also against a Postgres service container). No coverage threshold is
enforced — see [testing-strategy.md](testing-strategy.md) for what's intentionally not
covered and why.

## ~~`console.error`/`console.warn` as the only logging surface~~ — improved, not solved

`infrastructure/observability/logger.ts` gives every log line outside `sync_events` a
consistent `{ level, scope, message, ...fields, time }` JSON shape, and the six
call sites that used to be raw `console.error`/`console.warn` (the safe-action error
handler, `process-records.ts`, both notifier files, the Apify webhook route, and
`SyncLogger`'s own fallback) now go through it. There's still no external log
aggregation or error-tracking service wired up — the logger has an `ErrorReporter` seam
(`setErrorReporter`) for that specifically so adding Sentry later is a small, additive
change rather than a rewrite, but nothing is plugged into it today. Fine for a
single-instance Vercel deployment; revisit if the team wants managed error tracking
instead of relying on Vercel's own log output.

## ~~`login_attempts` grows forever~~ — fixed

`application/auth/login-attempts.ts` records every sign-in attempt (success or
failure) to throttle brute-forcing (`domain/auth/rate-limit.ts`,
`LOGIN_MAX_FAILED_ATTEMPTS = 5` within a 15-minute window).
`application/maintenance/prune-old-rows.ts::pruneOldRows` prunes both `login_attempts`
and `sync_events` past their retention window — `sync_runs` and `lead_events` are
deliberately excluded (audit trail, not append-only noise). Nothing calls it on a
schedule today — see "no scheduled trigger" below.

## ~~No scheduled trigger for discovery, sync, FX refresh, or retention pruning~~ — fixed

Four `GET /api/cron/*` routes used to run these on a Vercel cron schedule
(`vercel.json`): discovery every 15 min, sync every 5 min, FX refresh daily, retention
weekly. All four routes, `vercel.json`, and the `CRON_SECRET` env var were removed in
favour of n8n-triggered endpoints. Replaced by four `POST /api/trigger/*` routes (see
[api-patterns.md](api-patterns.md)'s System routes table), each guarded by
`N8N_TRIGGER_SECRET`, calling the same underlying functions that survived the removal
untouched:

| Function | Route |
| --- | --- |
| `application/sync/discovery.ts::discoverAllSources` | `POST /api/trigger/discover` |
| `application/sync/sync-dataset.ts::dueDatasets` + `syncDataset` | `POST /api/trigger/sync` |
| `application/fx/refresh-fx-rates.ts::refreshFxRates` | `POST /api/trigger/fx` |
| `application/maintenance/prune-old-rows.ts::pruneOldRows` | `POST /api/trigger/retention` |

This closes the code-side half of the gap — the routes exist, are auth-gated, and are
ready to be called. It does **not** by itself fix ingestion cadence: nothing calls
these routes until an actual n8n workflow is built to hit them on a schedule (that's
external, n8n-side configuration, not something this repo can do on its own — see
`docs/environment.md`'s "Scheduled jobs" section for the suggested cadence per route).
Until that n8n workflow exists, the practical effect is unchanged from before: ingestion
still only happens via an actor-run webhook or a manual "Sync" click.

## Migration history was collapsed once, during the person-centric refactor

`infrastructure/db/migrations/` restarts at `0000_cool_forge.sql` — the previous
history (through `0006_yellow_rockslide.sql`) was deleted and regenerated fresh when
`leads` split into `leads` (person) + `lead_appearances`, because `drizzle-kit
generate`'s rename-resolution prompts require an interactive TTY that wasn't available
in the environment making the change. Safe specifically because no environment at the
time held data worth preserving (confirmed before doing it, not assumed) — dev/test/e2e
Postgres instances were reset (`DROP SCHEMA public CASCADE`) and rebuilt from the new
baseline. If this repository ever has real data to preserve, do not repeat this move —
hand-write an incremental migration instead, however tedious.

## Lead search's `locations`/`propertyTypes` branches are unindexed

`application/leads/lead-queries.ts::buildConditions`'s `q` free-text search matches
against `leads.locations`/`leads.propertyTypes` (the "Location"/"Category" parts of
Section 8's search — see the dashboard work) via `EXISTS (SELECT 1 FROM
unnest(...) WHERE ... ILIKE ...)`, which cannot use an index — it's a per-row scan.
The scalar `leads.name`/`leads.location` branches of the same search *are* indexed
(`leads_name_trgm_idx`, `leads_location_trgm_idx`, both GIN trigram). The natural fix —
a functional GIN trigram index on `array_to_string(locations, ' ')` — was attempted and
reverted: Postgres's `array_to_string()` is not marked `IMMUTABLE`, so a functional
index on it is rejected outright at `CREATE INDEX` time (see the reverted migration
history around `0010`). Revisit with either a small custom `IMMUTABLE` SQL wrapper
function, or a generated/denormalized text column kept in sync at write time, if this
ever shows up as a real bottleneck — low risk today at this app's per-company row
counts.

## The product-level gap: buyer-side data collection

This isn't code debt, but it's the single highest-leverage known gap and worth
surfacing to anyone picking up this codebase: the datasets currently being collected via
n8n are almost entirely **seller listings and job posts**, not buyer posts. The
platform-side pipeline (discovery → scoring → alerting) is built to find buyers, but it
can only score what n8n feeds it. Expanding into buyer-side Facebook groups, keyword
searches, and mining commenters on listing posts is an n8n/data-sourcing change, not a
change in this repository.
