# Known Tech Debt

## React Query staleness on background (non-actor) changes to leads/datasets

`revalidateTag(tag, "max")` from `/api/cron/sync` and the Apify webhook invalidates the
RSC tag cache in the background, which is correct for that cache — nobody's actively
waiting on a cron-triggered write. But a browser tab with `/leads` or the topbar
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

## `/pipeline`, `/intelligence`, `/admin/sync` are placeholders, not 404s

They used to be dead nav links (404 on click) — now they're real pages with an honest
"not built yet" state (`components/common/coming-soon.tsx`), which is the right fix for
a UI-only pass but not a substitute for the features themselves. Worth knowing:
`application/datasets/dataset-queries.ts::getDatasetDetail` and `getSyncEvents` already
exist and are unused by any page — a real per-dataset detail/log view could be built on
top of them without new query-layer work. What's missing for `/admin/sync` specifically
is a product decision (per-dataset detail view vs. a cross-dataset activity feed, which
would need a new "recent runs across all datasets" query) more than missing plumbing —
that's why this round left it as a placeholder rather than guessing the IA.

## Five server actions exist with no UI wired to them yet

`assignLead`, `toggleBookmark` (`application/leads/lead.actions.ts`), `configureSync`,
`acceptSchemaVersion`, `approveMappingProfile` (`application/datasets/dataset.actions.ts`)
are fully implemented, validated, tagged for cache invalidation, and unreachable from
any page today — same shape as the `getDatasetDetail`/`getSyncEvents` situation above.
Each corresponds to a real schema column or workflow already in the domain model
(`lead_states.assignedTo`/`bookmarked`, `datasets.autoSyncEnabled`/`syncIntervalSeconds`,
`dataset_versions.acceptedAt`, `mapping_profiles.approvedAt`) — this is backend capacity
ahead of UI, not orphaned code, and the fix when the UI exists is "wire a button to the
existing action," not "write the action." Kept (not deleted) for the same reason as
`getDatasetDetail`/`getSyncEvents`.

## ~~Duplicated ranking formula (SQL vs. TypeScript)~~ — fixed

`domain/lead/ranking.ts` now exports its weights (`BUYER_INTENT_WEIGHT`,
`BUYER_QUALITY_WEIGHT`, `NON_BUYER_INTENT_WEIGHT`, `RECENCY_HALF_LIFE_HOURS`) instead of
inlining them, and `application/leads/priority-sql.ts::prioritySortExpression()` builds
the `ORDER BY` SQL from those same constants — one formula, two consumers.
`lead-queries.ts` just calls the builder now. Still deliberately omits the
`hasContact`/`alreadyWorked` display-only multipliers from the SQL side (a secondary
tie-break, not the primary sort key) — see the comment on `prioritySortExpression` if
that gap ever needs closing.

Building this surfaced a real bug worth remembering: interpolating a bare JS number like
`0.7` into a Drizzle `sql` template lets Postgres infer the parameter's type from
surrounding context — multiplying against the integer `intent_score` column made it
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

## Duplicate detection is same-source-kind agnostic but not cross-dataset budget-aware

`findCanonicalDuplicate` in `application/leads/process-records.ts` matches on trigram
body similarity + optional `authorExternalId` within a 72-hour window
(`NEAR_DUPLICATE_WINDOW_HOURS`), scoped to `leads.body` globally — not scoped to
`datasetId`. This is deliberate (the same post can be scraped into two different
datasets, e.g. Facebook and Instagram mirrors of the same content) but means a
`similarity()` GIN-trigram scan runs across the whole `leads` table on every new record.
At current volumes this is fine; if lead volume grows an order of magnitude, this query
is the first place to look for a performance regression.

## ~~FX rates have a hardcoded fallback table, never refreshed~~ — fixed

`FALLBACK_USD_RATES` in `application/leads/process-records.ts` is still there as a
last-resort default, but `fx_rates` is no longer seed-once-and-forget.
`application/fx/refresh-fx-rates.ts` refreshes every currency already tracked in
`fx_rates` from `infrastructure/fx/fx-rate.provider.ts` (ECB rates via
frankfurter.dev, free, no API key), and `GET /api/cron/fx` runs it once daily (see
`vercel.json`). A failed refresh — network error, upstream shape change — leaves the
existing rows untouched and logs via the structured logger rather than throwing;
budget filtering degrades to "stale" in that case, never to "broken."

## No LLM classifier yet — `LeadClassifier` port is unused beyond `rules@2`

`domain/scoring/types.ts::LeadClassifier` and `RULES_CLASSIFIER_ID = "rules@2"` are
explicitly designed as a seam for a future ML/LLM classifier (shadow-mode validated per
the README), but only the rules-based implementation exists
(`domain/scoring/rules-classifier.ts`). `leads.classifierId` is stored per-row
specifically so a future classifier swap can be measured/rolled out per-lead, but there
is no A/B or shadow-mode plumbing built yet — just the column.

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
`LOGIN_MAX_FAILED_ATTEMPTS = 5` within a 15-minute window). `GET /api/cron/retention`
(daily) now prunes both `login_attempts` and `sync_events` past their retention window
via `application/maintenance/prune-old-rows.ts` — `sync_runs` and `lead_events` are
deliberately excluded (audit trail, not append-only noise).

## The product-level gap: buyer-side data collection

This isn't code debt, but it's the single highest-leverage known gap and worth
surfacing to anyone picking up this codebase: the datasets currently being collected via
n8n are almost entirely **seller listings and job posts**, not buyer posts. The
platform-side pipeline (discovery → scoring → alerting) is built to find buyers, but it
can only score what n8n feeds it. Expanding into buyer-side Facebook groups, keyword
searches, and mining commenters on listing posts is an n8n/data-sourcing change, not a
change in this repository.
