# Lead Source Scaling Plan

**Status (2026-07-26): Phases 1–6 shipped.** `record_kind` schema, mapping-profile
projection, the `classifyEngagement` scorer, identity-based dedup, the `[object Object]`
fix, and the `recordKind` filter/facet/breakdown are all in. Phase 7 (re-benchmark,
LLM classifier) is still open, and — per 2f below — no curated mapping profile exists
yet for a *real* Post Likers/IG-likers actor; see
[tech-debt.md](tech-debt.md#no-curated-mapping-profile-exists-yet-for-a-real-engagement-shaped-actor)
for why that's a deliberate gap, not an oversight.

Planning doc for extending the pipeline to Facebook Post Likers, Instagram Post Likers,
Facebook Groups, and future platforms, while fixing the concrete data-quality bugs found
during this review. Written against the codebase as of 2026-07-26. See
[architecture.md](architecture.md), [domain.md](domain.md), [tech-debt.md](tech-debt.md),
[prd.md](prd.md) for the system this builds on — this doc doesn't repeat what's already
documented there except where needed for context.

**Headline finding**: the pipeline's source/dataset/mapping-profile layer already scales
to new scrapers with zero code change — that part of the architecture is correctly
designed and doesn't need rework. The actual gap is that the system has one implicit
assumption baked into the classifier and dedup logic: every record is a **post with
body text**. A "Post Likers" scrape produces records that are **people, not posts** —
no body text, no phrases to classify, no post-similarity to dedupe on. That mismatch
is the root cause of every concrete problem below.

## 1. Current architecture

**Structure.** `domain/` (pure logic, no I/O) → `application/` (use cases, Zod
boundaries) → `infrastructure/` (Apify connector, Postgres, notifiers, auth) →
`features/`+`app/` (UI). Dependency rule runs one way; `domain` imports nothing outside
itself. Full layout in architecture.md's "Layered dependency rule" section.

**Data flow**: `DISCOVER → PROBE → INGEST → NORMALIZE → DEDUPE → SCORE → SERVE → ALERT`.

**How leads are currently collected**:
1. A `sources` row (kind `apify` today) represents a connector instance.
   `discoverAllSources`/`discoverDatasets`
   ([application/sync/discovery.ts](../application/sync/discovery.ts)) calls
   `apifyConnector.listDatasets()`
   ([infrastructure/apify/apify.connector.ts](../infrastructure/apify/apify.connector.ts)),
   which enumerates **both** named datasets (n8n's curated targets) and unnamed ones
   (individual actor-run outputs) — Apify's API hides unnamed datasets unless asked
   explicitly, and this connector already asks. Discovered datasets are filtered by the
   source's `config` (`producerIds`/`namePatterns`/`minItemCount`) and upserted into
   `datasets`, never deleted (a vanished upstream dataset is flagged `missing`, keeping
   its derived leads valid).
2. `syncDataset` pulls new items from the dataset's watermark offset, stores each
   verbatim in `raw_records` (keyed by `(datasetId, sourceItemId)`, carrying a
   `contentHash`/`payloadHash`), then calls `processRawRecords`
   ([application/leads/process-records.ts](../application/leads/process-records.ts)).
3. `processRawRecords` projects the raw payload through the dataset's `mapping_profiles`
   row (`applyMapping`), classifies it (`classifyWithRules`, currently the only
   classifier — `rules@2`), checks for a near-duplicate (`findCanonicalDuplicate`), and
   upserts into `leads` (idempotent on `rawRecordId`).
4. **Trigger gap** (already documented, not new): there's no scheduled trigger wired up.
   n8n pushes into named datasets via the Dataset API, which never fires a "run
   succeeded" webhook, so today ingestion only happens on an actor-run webhook or a
   manual click in `/admin/datasets`. See tech-debt.md's "no scheduled trigger" entry —
   out of scope for this doc, called out because it compounds problem 2g below (batches
   pile up between manual syncs).

**How the admin currently manages data**: `/admin/datasets` (registry, health,
mapping-profile review/approval, manual sync trigger), `/admin/sync` (cross-dataset
activity feed, per-dataset drill-in, schema-drift version acceptance), `/admin/team`
(accounts), and `alert_rules` (who gets alerted about what, via the predicate language in
[domain/alerting/predicate.ts](../domain/alerting/predicate.ts)). Agents work `/leads`
(filter/search/triage inbox), `/pipeline` (kanban), `/intelligence` (aggregate trends).

## 2. Problems

Each item below is grounded in a specific file — not a hypothetical.

**a. `[object Object]` rendering — confirmed, isolated bug.**
[features/leads/components/lead-detail-sheet.tsx:148](../features/leads/components/lead-detail-sheet.tsx#L148)
renders passthrough `attributes` with `String(value).slice(0, 60)`. Any attribute whose
raw shape is an object or array — e.g. Facebook's nested `attachments[].photo_image`, or
a liker record's nested profile object — renders literally as `[object Object]` in the
"Source fields" panel.

**b. Duplicate data for engagement-only records.**
[application/leads/process-records.ts:48](../application/leads/process-records.ts#L48)
— `findCanonicalDuplicate` requires `body.trim().length >= 40` before running any
similarity check. A Post Likers/commenter scrape item has no post text (the record *is*
a person, not a post), so this gate never engages for that shape. Every resync of the
same dataset, or the same actor run against a second listing, produces a new
`raw_records` row (different `sourceItemId`) and therefore a new, un-linked `leads` row
for the same person. At the volume a "Post Likers" actor produces (hundreds of likers ×
many listings, resynced repeatedly) this is unbounded duplicate-lead growth.

**c. Unclear/empty lead information for engagement-only records.**
`classifyWithRules` ([domain/scoring/rules-classifier.ts:54](../domain/scoring/rules-classifier.ts#L54))
builds every signal from `body`/`listingTitle` text. A liker record normalizes to
`body=""` → zero phrase hits → `intent: "other"`, `intentScore: 0`, empty
`scoreReasons`. It's indistinguishable in the inbox from a genuinely irrelevant post,
even though "liked three different $400k villa listings this week" is a real signal.
There's currently no field capturing *what they engaged with* — that context is dropped
at ingest.

**d. Missing profile information.** Direct consequence of (c): `leads` has
`authorAvatarUrl`/`authorUrl` but nothing models "what post/listing triggered this
record." Forcing a liker through the same post-shaped canonical fields as a group post
is exactly why it reads as an empty, unclear lead in the UI.

**e. Poor filtering for this record type.** `LeadFilterBar`
([features/leads/components/lead-filter-bar.tsx](../features/leads/components/lead-filter-bar.tsx))
renders whatever enum facets the backend discovers — genuinely well-built, no hardcoded
list — but there's no "content type" dimension to discover yet, because it doesn't exist
on the schema. An agent can't currently filter "people who liked 2+ listings this
month" — that pattern isn't representable.

**f. Source/connector kind conflates transport with content shape.**
`sourceKindEnum` ([infrastructure/db/schema/enums.ts:3](../infrastructure/db/schema/enums.ts#L3))
is `apify | n8n | webform | manual` — how data *arrives*, not what shape it *is*. Mapping
profiles already correctly disambiguate different Apify actor outputs via `matchPaths`
(a genuine strength — this is the part of the system that already scales to new scrapers
with zero deploy). But nothing downstream — classifier, dedup, UI — knows a given mapping
profile's output represents an engagement signal rather than a content post. This is the
actual gap between "current architecture" and "Facebook Post Likers / Instagram Post
Likers as first-class lead types."

**g. Dedup query scalability, worsened by (b).** tech-debt.md already flags
`findCanonicalDuplicate`'s trigram scan as unscoped across the whole `leads` table.
Adding high-volume engagement-only sources multiplies write volume *and*, per (b),
skips deduping the majority of those writes — the eventual scan gets more expensive
while the actual duplicates it should be catching sail through the `body.length >= 40`
gate untouched.

**h. No path for AI/LLM classification to earn its keep yet.** The `LeadClassifier`
port and `classifierId` column exist specifically for a future classifier
(domain/scoring/types.ts, tech-debt.md), but only `rules@2` (phrase-matching) is
implemented. Phrase matching is workable for group-post text; it has *no* signal at all
for an engagement-only record with no body. That's precisely the case where an
LLM/embedding-based signal ("this profile plus the three listings they engaged with
suggests budget band X") would add value a lexicon structurally cannot.

**i. Maintenance risk if solved ad hoc.** The tempting shortcut is an
`if (!body) return likerScore(...)` special case bolted onto the existing classifier,
which would violate the domain-purity/ports layering the rest of the codebase follows
carefully. The fix belongs in the mapping/classification *contract* (a typed
`recordKind`), not a conditional branch on missing data.

**Not new, but load-bearing context**: tech-debt.md and prd.md already flag that current
n8n feeds are almost entirely seller listings, and both call out post-liker/commenter
mining as the way to find buyer-side signal. This plan is the code-side counterpart of
that already-known roadmap item — the product gap and the code gap are the same gap.

## 3. New architecture proposal

**Principle: extend, don't replace.** The `sources → datasets → mapping_profiles →
raw_records → leads → lead_states` pipeline, raw-payload replay, curated-mapping-wins,
human/derived state split, link-not-delete dedup, and explainable scoring are all sound
and don't need rework. The gap is one dimension — "what kind of thing is this record" —
missing from four places: mapping profile, `leads` schema, classifier, dedup. Not a new
pipeline.

**3.1 `recordKind` on mapping profiles and leads.** Add a `record_kind` value —
`content_post | engagement_like | engagement_comment` (open to more later:
`engagement_share`, `profile_scrape`) — to `mapping_profiles` and `leads`. A mapping
profile already claims a dataset by `matchPaths` (structural shape match); a "Post
Likers" actor's output is structurally distinct (a user object, no post-text field) from
a "Group Posts" actor's output, so declaring `recordKind` alongside `matchPaths` costs
nothing architecturally — it's the same mechanism that already correctly separates
different Apify actor shapes today.

**3.2 Engagement context, not a new canonical column.** For `engagement_*` records, carry
`targetPostUrl` / `targetPostExternalId` / a cheap denormalized snapshot (title, price,
location at scrape time — the target post itself may never be ingested) inside
`NormalizedRecord.attributes` under a reserved key, rather than growing
`CANONICAL_FIELDS`. This keeps the canonical spine small (the explicit design decision in
domain.md — "alerting/scoring must mean something specific over a fully open schema")
while making "what did they engage with" queryable through the existing dynamic
attributes/facet machinery with zero new filter-UI code.

**3.3 Classifier: an explicit engagement branch, LLM-ready.** `ClassifierInput` gains
optional `recordKind` + engagement context. `classifyWithRules` gets a second, named
branch — `classifyEngagement(input)`, not an `if (!body)` special case — scored on what
they engaged with (the liked post's price/property-type/location) and repeat-engagement
count (same person, N distinct listings in a window). This produces real, explainable
`scoreReasons` instead of a silent zero, and is the natural seam for the
already-designed-but-unbuilt LLM classifier (tech-debt.md) — an empty-body engagement
record is exactly the case a phrase lexicon can't help with and an LLM given "profile +
engaged listings" can. Ship the rules-based engagement branch first; the LLM swap-in path
(`LeadClassifier`/`classifierId`, shadow-mode) is already designed, just unused.

**3.4 Dedup: identity-based for engagement records.** `findCanonicalDuplicate` gains a
second path for `recordKind` starting with `engagement_`: canonical match on
`(authorExternalId, targetPostExternalId)`, analogous to how `raw_records` is already
keyed by `(datasetId, sourceItemId)` for exact-record idempotency — this is the
leads-level equivalent for engagement identity. A person liking the *same* post twice
(re-scraped) collapses to one lead; liking *different* posts stays separate (each is a
real, distinct signal that should roll up as repeat-engagement evidence per 3.3, not be
deduped away). Directly fixes 2b without touching the existing trigram path used for
genuinely reposted text.

**3.5 UI.**
- Ship the `[object Object]` fix standalone, now: replace `String(value)` in
  `lead-detail-sheet.tsx` with a type-aware formatter (arrays → join, objects →
  `JSON.stringify`, primitives → `String`). No schema dependency.
- `LeadFilterBar`/`getLeadFacets` picks up a `recordKind` facet automatically once it's a
  real enum column — this is exactly what the existing dynamic-facet system
  (`field_catalog` + `facets.ts`) already does for any new discovered dimension.
- `LeadDetailSheet` gets a conditional "Engaged with" section (post snapshot + repeat
  count) for `recordKind !== content_post`, replacing the current empty
  `"(no text)"` Post section — the literal UX symptom of 2c/2d.

**3.6 Source tracking stays as-is, deliberately.** No change to `sources`/
`sourceKindEnum` — that axis already correctly models *transport*
(apify/n8n/webform/manual) and shouldn't also model *content shape*; conflating them
would break the curated-mapping-profile-claims-a-dataset mechanism that's already doing
correct multi-shape source tracking. Facebook Groups, Facebook Post Likers, Instagram
Post Likers, and any future platform's actor output are each just a new mapping profile
with its own `matchPaths` + `recordKind` — no code deploy, matching the system's existing
"no hardcoded dataset ID" goal.

**3.7 Performance.**
- New `leads_record_kind_idx`, folded into the existing partial-index pattern
  (`leads_active_*`, scoped to `isSpam = false AND canonicalLeadId IS NULL`).
- The engagement-identity dedup lookup (3.4) is an indexed equality check, cheaper than
  the trigram scan it replaces for this record type — a net win despite the added write
  volume from Post Likers-scale batches.
- `assessMappingQuality` ([domain/dataset/mapping-quality.ts](../domain/dataset/mapping-quality.ts))
  needs to become `recordKind`-aware: today it revokes a profile whose first batch is
  "mostly empty body" (tech-debt.md) — an `engagement_like` profile is *supposed* to have
  empty body, so without this change the guardrail will false-positive-revoke every
  liker mapping profile on its first sync.

## 4. Feature roadmap

**Phase 1 — Database**
`record_kind` enum + column on `mapping_profiles` and `leads`, default `content_post`
(every existing row backfills correctly, zero behavior change). Reserved `attributes`
keys for engagement context (no new table — reuses the existing jsonb column). New
indexes per 3.7. Purely additive — no existing query, profile, or classifier call site
breaks, and nothing reads the new column yet so it's safe to ship with no flag.

**Phase 2 — Lead collection (mapping side)**
Curated mapping profiles for the real upstream actors: Facebook Groups (verify/relabel
existing profile with `recordKind = content_post`), Facebook Post Likers, Instagram Post
Likers — each with real `matchPaths` for that actor's actual output shape and the correct
`recordKind`. Confirm `guessBody`/`guessItemId` (sync-dataset.ts) degrade safely for
likers before a mapping profile is approved (tech-debt.md already documents the
fallback — verify against real payloads, don't assume).

**Phase 3 — Classification**
`classifyEngagement` branch (3.3) with domain-layer unit tests per this repo's existing
acceptance-criteria pattern (prd.md). Repeat-engagement scoring signal. Extend
`assessMappingQuality` to be `recordKind`-aware (3.7) before Post Likers profiles go live,
not after.

**Phase 4 — Dedup fix**
Identity-based dedup path (3.4). Highest-leverage individual fix in this plan — ship as
soon as Phase 1's column exists, even ahead of the classifier/UI phases, since it stops
unbounded duplicate growth immediately.

**Phase 5 — Dashboard / UI**
`[object Object]` fix (independent, ship immediately — one file, no schema dependency,
don't wait for the rest of this roadmap). "Engaged with" section replacing the empty Post
section. `recordKind` facet (automatic once the column + facet discovery pick it up).

**Phase 6 — Filtering & Intelligence**
`/leads` filter chip for record kind. `/intelligence` breakdown by record kind alongside
existing intent/location/property-type breakdowns, reusing `getLeadFacets` per the
pattern already used when `/intelligence` was built (tech-debt.md).

**Phase 7 — Optimization**
Re-benchmark `findCanonicalDuplicate`'s trigram path now that engagement volume no longer
flows through it (tech-debt.md's existing scale warning narrows to content-post volume
only). LLM classifier shadow-mode wiring behind the existing `LeadClassifier`/
`classifierId` seam, engagement records as the first candidate — the case rules-based
phrase matching structurally cannot help.

**Ship today, independent of the rest**: the `[object Object]` fix (Phase 5, detachable,
zero schema change) and verifying the Facebook Groups mapping profile's `matchPaths`
against real current payloads (Phase 2, partially detachable — correctness check doesn't
need to wait on the `recordKind` column, only the labeling does).
