# Known Tech Debt

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

## Admin table row memoization (`DatasetTable`, `TeamTable`) not applied

`LeadInbox`'s row components (`LeadCard`, `LeadRow`) are `React.memo`'d because
`isFetching`/`isPlaceholderData` toggling is a *wrapper*-level state change — every row
was re-rendering for a prop set that hadn't actually changed. `DatasetTable` has a
similar shape (`busyId` state, one row's `disabled={busyId === dataset.id}` flips while
every other row's `disabled` prop evaluates to the same `false` before and after), so
the same fix would save the same kind of wasted re-render. Left as-is because dataset
and team lists are small (tens of rows, not a paginated hundreds-deep list like leads)
and the win is marginal at that size — worth doing if either table's row count grows
enough to matter; the recipe is `features/leads/components/lead-inbox.tsx`'s `LeadRow`.
`TeamTable` doesn't have this issue at all — its `busy` flag legitimately changes every
row's `disabled` prop simultaneously, so memoizing its rows wouldn't skip any work.

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

## No LLM classifier or rollup yet — `LeadClassifier`/`LeadIntelligence` ports are unused beyond the rules implementations

`domain/scoring/types.ts::LeadClassifier` (`RULES_CLASSIFIER_ID = "rules@2"`) and
`domain/scoring/lead-rollup.ts::LeadIntelligence` (`RULES_ROLLUP_ID = "rules-rollup@1"`)
are explicitly designed as seams for a future ML/LLM implementation each (shadow-mode
validated per the README), but only the rules-based versions exist. Both `classifierId`
columns (`lead_appearances.classifierId` per appearance, `leads.classifierId` for the
person rollup) are stored specifically so a future swap can be measured/rolled out
incrementally, but there is no A/B or shadow-mode plumbing built yet — just the columns.
An engagement-only lead (no body text anywhere) is the concrete case where an LLM
rollup would earn its keep first — see domain.md's "AI analysis" section.

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

## No scheduled trigger for discovery, sync, FX refresh, or retention pruning

Four `GET /api/cron/*` routes used to run these on a Vercel cron schedule
(`vercel.json`): discovery every 15 min, sync every 5 min, FX refresh daily, retention
weekly. All four routes, `vercel.json`, and the `CRON_SECRET` env var were removed —
scheduling is moving to n8n, which is not wired up yet. The underlying functions are
untouched and still fully tested:

| Function | Was scheduled |
| --- | --- |
| `application/sync/discovery.ts::discoverAllSources` | every 15 min |
| `application/sync/sync-dataset.ts::dueDatasets` + `syncDataset` | every 5 min |
| `application/fx/refresh-fx-rates.ts::refreshFxRates` | daily |
| `application/maintenance/prune-old-rows.ts::pruneOldRows` | weekly |

**Current effect of the gap**: dataset-API traffic from n8n (the majority of it — see
architecture.md's "Polling was the primary change signal" note) is not picked up at
all until either someone clicks "Sync" in `/admin/datasets` or an actor-run webhook
fires. FX rates and old rows just don't refresh/prune. None of this corrupts data —
everything degrades to "stale," not "wrong" — but it is a real gap, not a cosmetic one,
until n8n (or something) calls these functions again. The fix is new trigger
endpoints (see api-patterns.md's System routes section for the pattern to follow) once
the n8n side is ready — not restoring the cron routes.

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

## The product-level gap: buyer-side data collection

This isn't code debt, but it's the single highest-leverage known gap and worth
surfacing to anyone picking up this codebase: the datasets currently being collected via
n8n are almost entirely **seller listings and job posts**, not buyer posts. The
platform-side pipeline (discovery → scoring → alerting) is built to find buyers, but it
can only score what n8n feeds it. Expanding into buyer-side Facebook groups, keyword
searches, and mining commenters on listing posts is an n8n/data-sourcing change, not a
change in this repository.
