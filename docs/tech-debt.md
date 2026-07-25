# Known Tech Debt

## Duplicated ranking formula (SQL vs. TypeScript)

`domain/lead/ranking.ts::priorityScore` is the canonical, unit-tested implementation of
inbox priority (recency half-life, contactable bonus, already-worked penalty). But
`application/leads/lead-queries.ts::orderBy()` re-implements the same recency-decay math
by hand as a raw SQL expression, because sorting/pagination has to happen in the
database — you can't `ORDER BY` a value computed in application code after the fact.
`getLeadStats`/list `items` still compute `priorityScore` in JS afterward for display,
so **the two formulas must be kept in sync by hand.** If you change the weights or the
half-life in `ranking.ts`, you must also update the SQL in `lead-queries.ts`'s `orderBy`
switch — there is no test enforcing this and nothing will fail loudly if they drift,
only the *ordering* will silently disagree with the *displayed* priority number. A
future fix would be a Postgres function generated from (or tested against) the same
constants, but that's not done.

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

## Auto-approved mapping profiles are a real risk, by design

Auto-generated mapping profiles with confidence ≥ `MAPPING_AUTO_APPROVE_CONFIDENCE`
(0.8, `shared/constants.ts`) are approved and applied automatically, no human in the
loop. This is an intentional tradeoff (see `architecture.md`'s "curated beats
auto-proposal" decision) but it means a sufficiently plausible-looking wrong mapping
*can* silently start producing bad leads for a brand-new source kind until someone
notices in `/admin`. There's no automated alert today when an auto-approved profile's
downstream classification quality looks off (e.g. an unusual spike in `isSpam` or a
collapse in non-null `body`). If you're asked to improve monitoring, this is a good
target.

## Duplicate detection is same-source-kind agnostic but not cross-dataset budget-aware

`findCanonicalDuplicate` in `application/leads/process-records.ts` matches on trigram
body similarity + optional `authorExternalId` within a 72-hour window
(`NEAR_DUPLICATE_WINDOW_HOURS`), scoped to `leads.body` globally — not scoped to
`datasetId`. This is deliberate (the same post can be scraped into two different
datasets, e.g. Facebook and Instagram mirrors of the same content) but means a
`similarity()` GIN-trigram scan runs across the whole `leads` table on every new record.
At current volumes this is fine; if lead volume grows an order of magnitude, this query
is the first place to look for a performance regression.

## FX rates have a hardcoded fallback table

`FALLBACK_USD_RATES` in `application/leads/process-records.ts` (`USD/IDR/EUR/AUD`) is a
static, never-updated snapshot used when `fx_rates` has no row for a currency. The seed
script populates the same four currencies once at seed time
(`infrastructure/db/seed.mjs`) and nothing refreshes them on a schedule — the README's
"Not built yet" list doesn't call this out explicitly, but there is no cron job or
admin action to refresh `fx_rates` from a live source. Budget filtering in USD will
silently drift from reality over time. Low priority unless budget-based alerting
thresholds start looking wrong.

## No LLM classifier yet — `LeadClassifier` port is unused beyond `rules@2`

`domain/scoring/types.ts::LeadClassifier` and `RULES_CLASSIFIER_ID = "rules@2"` are
explicitly designed as a seam for a future ML/LLM classifier (shadow-mode validated per
the README), but only the rules-based implementation exists
(`domain/scoring/rules-classifier.ts`). `leads.classifierId` is stored per-row
specifically so a future classifier swap can be measured/rolled out per-lead, but there
is no A/B or shadow-mode plumbing built yet — just the column.

## No coverage/CI gate

There's a Husky pre-commit hook (`npm test`) but no CI config found in the repo and no
coverage threshold. See [testing-strategy.md](testing-strategy.md). If CI is added,
decide deliberately what should gate a merge vs. what should just warn.

## `console.error`/`console.warn` as the only logging surface outside `sync_events`

Sync runs get structured logging via `SyncLogger` → `sync_events` table (queryable from
the admin log viewer), but everything else — action errors, notifier failures, missing
connector registrations — goes to `console.error`/`console.warn` only. There's no
external log aggregation or error-tracking integration configured. Fine for a
single-instance Vercel deployment today; would need attention before scaling the team
running this.

## The product-level gap: buyer-side data collection

This isn't code debt, but it's the single highest-leverage known gap and worth
surfacing to anyone picking up this codebase: the datasets currently being collected via
n8n are almost entirely **seller listings and job posts**, not buyer posts. The
platform-side pipeline (discovery → scoring → alerting) is built to find buyers, but it
can only score what n8n feeds it. Expanding into buyer-side Facebook groups, keyword
searches, and mining commenters on listing posts is an n8n/data-sourcing change, not a
change in this repository.
