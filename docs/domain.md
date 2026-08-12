# Domain Glossary

Business terms and entity relationships. See [architecture.md](architecture.md) for how
these flow through the pipeline, and `domain/*/types.ts` for the authoritative type
definitions — this document explains the *why*, not the shape.

## Core entities

**Company** (`companies` table) — a tenant. Every business-data table carries a
`companyId` back to this table (see `docs/saas-platform-architecture.md`). Has a
**category** (`real_estate | travel | courses | other`), chosen once at signup and
not editable afterward — see the next entry.

**Company category** (`companies.category`, `domain/verticals/catalog.ts`) — the
business vertical a tenant operates in, picked as step one of `/signup`, before
the company name/email/password. Not a UI skin: it selects which intent-phrase
lexicon scores that company's leads (`domain/scoring/lexicon-registry.ts`), which
labels the lead inbox/detail-sheet fields use ("Property types" vs. "Trip
interests" vs. "Course interests"), and which registered Apify actor templates
get recommended first at `/admin/collection`. Deliberately immutable post-signup:
changing it later would silently change how existing leads *would have* scored
without ever reprocessing them. The canonical spine itself
(`propertyTypes`/`locations`/budget columns, the `leadTypeEnum`) stays one shared
shape across every category — only the *lexicon* and *labels* vary, not the
schema.

**Super Admin** (`users.isPlatformAdmin`) — a cross-company, platform-operator
flag, orthogonal to the per-company `role` hierarchy (a company `owner` does not
pass this check). Not grantable from any in-app UI — set only by a direct
database edit. Unlocks `/platform/*`, a separate dark-shelled UI unreachable from
any link inside the tenant app, with **read-only** visibility into every
company's usage/health/billing metadata and exactly two logged, reversible
support actions (extend a trial, resend a stuck invite) — never a tenant's actual
leads. See `docs/multi-tenant-apify-isolation-plan.md` §3 and the
`super_admin_actions` table (`infrastructure/db/schema/platform.ts`), the
append-only audit log every such action writes to.

**Source** (`sources` table) — a connector instance, e.g. "Apify — Facebook & Instagram
scrapers." Replaces what used to be an `APIFY_ACTOR_ID` env var. Has a `kind`
(`apify` | `n8n` | `webform` | `manual`) that selects the adapter from
`infrastructure/connectors/registry.ts`, and a `config` JSON blob
(`producerIds`, `namePatterns`, `minItemCount`) that narrows which upstream datasets it
tracks.

**Dataset** (`datasets` table) — one upstream collection of items (an Apify dataset id).
Discovered automatically, never configured by hand. Carries `health`
(`unknown|healthy|stale|degraded|schema_drift|error`), an adaptive
`syncIntervalSeconds`, and a `syncCursor` watermark (`{ lastOffset, lastItemCount,
lastSyncedAt }`) for incremental ingestion.

**Raw record** (`raw_records` table) — the verbatim upstream payload for one item,
keyed by `(datasetId, sourceItemId)`. This is the replay source of truth: every
appearance is re-derivable from here. Carries a `contentHash` (normalized text, for
cross-dataset duplicate detection) and `payloadHash` (whole payload, detects upstream
edits).

**Mapping profile** (`mapping_profiles` table) — a declarative, versioned set of
`FieldRule`s that projects an arbitrary raw payload onto the canonical spine
(`CANONICAL_FIELDS` in `domain/dataset/types.ts`). Either **curated** (hand-verified,
claims a dataset via `matchPaths` — all required paths must be present) or
**auto-generated** (`proposeMapping`, held for admin review unless confidence ≥ 0.8).
A curated profile always wins over an auto-generated one for the same source kind. Also
declares `recordKind` and `platform` (below) — static properties of *which actor
produced this shape*, not extracted from any individual payload.

**Lead** (`leads` table) — one row per **person**, deduplicated across every source they
were collected from (Facebook Groups, Facebook Posts, Facebook Comments, Facebook/
Instagram Post Likers, ...). Carries identity (`facebookId`, `instagramId`,
`profileUrl`, `username`), personal information (`name`, `avatarUrl`, `location`,
`bio`, `contact`), business classification (`leadType`), and the AI-analysis rollup
(`buyerScore`/`sellerScore`/`investorScore`/`confidenceScore`/`aiExplanation`) — see
"Identity resolution" and "Lead type vs. lead intent" below. Fully derived and freely
regenerable, same as before, just one level up: every column here is recomputed from
this person's `lead_appearances` rows (`domain/scoring/lead-rollup.ts::rollupPersonScores`)
and can be rebuilt from them at any time.

**Lead appearance** (`lead_appearances` table) — one row per scraped item (a post, a
like, a comment) — what `leads` meant before the person/appearance split. This is the
"every source where the lead was collected" ledger: `leadId` links every appearance to
the one person it was merged into. Carries the per-appearance classification
(`intent`, `intentScore`, `investorScore`, `brokerScore`, `scoreReasons`, ...) and
points at a `canonicalAppearanceId` when it's a detected repost/duplicate of an earlier
appearance. Fully derived from `raw_records`, same contract the old `leads` table had.

**Identity resolution** (`domain/lead/identity.ts`,
`application/leads/identity-resolution.ts`) — how an appearance's author is matched to
an existing person or becomes a new one. Deterministic and exact-match only, in
precedence order: `facebookId`, then `instagramId`, then normalized `profileUrl`.
Never fuzzy name matching — a wrong merge (two different "John Wilson"s collapsed into
one lead) is worse than a duplicate, the same risk posture as "curated beats
auto-proposal" elsewhere in this codebase. `username` alone is never used to merge
(not guaranteed unique or stable across platforms) — display only. An existing match
gets any personal-info field it was missing filled in, but an already-set field is
never overwritten (`mergePersonalInfo`) — a later appearance with stale cached profile
data can't silently clobber a correct earlier value. Runs once per appearance, at
creation; reprocessing an existing appearance reuses its already-resolved `leadId`
rather than re-resolving identity every replay.

**Record kind** (`lead_appearances.recordKind`, `mapping_profiles.recordKind`) — what a
record *is*, independent of intent: `content_post` (has body text — the default, and
every source before this field existed) or `engagement_like`/`engagement_comment` (a
person's reaction to someone else's post — a Facebook/Instagram "Post Likers" scrape,
say — with no body text of their own). This is a transport-independent axis from
`sources.kind` (apify/n8n/webform/manual, which models *how* data arrives, not *what
shape* it is) — see architecture.md's "Key design decisions". An `engagement_*`
appearance is scored on what it engaged with
(`domain/scoring/rules-classifier.ts::classifyEngagement`, via `attributes._engagement`
— see below) rather than phrase-matched, and deduped by `(authorExternalId,
targetPostExternalId)` identity rather than text similarity, since there's no body to
compare (`findEngagementDuplicate` in `application/leads/process-records.ts`). This is
appearance-level dedup ("was this exact like re-scraped"), independent of and running
alongside person-level identity merge — the same like re-scraped collapses to one
appearance; the same person liking two different posts stays two appearances under one
person.

**Platform** (`lead_appearances.platform`, `mapping_profiles.platform`) —
`facebook | instagram | other`. Needed so identity resolution knows whether a scraped
author id fills `leads.facebookId` or `leads.instagramId` when merging — a third,
independent axis alongside `sourceKind` (transport) and `recordKind` (content shape).

**Lead state** (`lead_states` table) — the human side of a lead: `status`, `assignedTo`,
`priority`, `notes`, `tags`, `bookmarked`, `firstContactedAt`. Keyed by *person* id, not
appearance id — assigning an agent or logging a note about a person makes sense; doing
it per-post never quite did. Created once (`onConflictDoNothing`) the first time a
person is touched by the pipeline or a human, and never overwritten by reprocessing.
This split is why a mapping change, reclassification, or rollup recompute is safe to run
at any time.

**Lead event** (`lead_events` table) — append-only audit trail (`created`,
`status_changed`, `assigned`, `note_added`, `contacted`, `alerted`, `reclassified`,
`merged`), keyed by person id. Source of funnel analytics and the "why did this change"
trail in the UI. `merged` is reserved for a future audit trail of identity-resolution
merges — not yet written by `resolveIdentity`.

**Alert rule** (`alert_rules` table) — a named `Predicate` (see below) plus channels,
recipients, throttle and digest settings. Evaluated against the person-level rollup
(`buyerScore`, `leadType`, ...), not any single appearance. Tuning "what counts as a hot
lead" is an admin edit, not a deploy — see the seeded "High-intent Bali buyer" rule in
`infrastructure/db/seed.mjs`.

**Alert delivery** (`alert_deliveries` table) — the send ledger. Unique on `dedupeKey =
sha256(ruleId:leadId:channel)` (person id), which is what stops a mapping-profile
backfill — or simply a person's tenth new appearance — from re-alerting the sales team
about someone already flagged.

**Field catalog** (`field_catalog` table) — per-dataset inferred schema (path, type,
fill rate, cardinality). Drives which discovered-but-unmapped fields become dynamic
filters (`facetable`) in the admin UI without a code change.

## Lead type vs. lead intent — two deliberately different taxonomies

**`LeadIntent`** = `buyer | seller | agent | other` (`domain/scoring/types.ts`) —
per-*appearance* classification, unchanged by the person/appearance split. What one
scraped post/comment looks like, produced by `classifyWithRules` for every
`content_post` appearance:

- **buyer** — explicit intent to acquire ("looking to buy", "cari villa").
- **seller** — supply-side listings ("for sale", "dijual"). Capped at intentScore ≤ 45
  so it can never outrank a buyer.
- **agent** — professional/agency listings ("our listing", "property agency").
- **other** — everything that doesn't clear a buyer/seller/agent signal, or was caught
  by the spam/recruitment gate (`isSpam = true`, score 0).

**`LeadType`** = `buyer | seller | agent | broker | investor | unknown`
(`domain/scoring/types.ts`) — person-level business classification, rolled up from
*every* appearance a person has (`domain/scoring/lead-rollup.ts::rollupPersonScores`),
not read off any single post. `"broker"` and `"investor"` have no `LeadIntent`
equivalent — they only exist at the rollup level, fed by additive per-appearance
signals (`investorScore`/`brokerScore` on `Classification`, from `INVESTOR_PHRASES`/
`BROKER_PHRASES` in `domain/scoring/lexicon.ts`) that don't change an appearance's own
`intent` pick. `leadType` is whichever of buyer/seller/agent/broker/investor scores
highest across all appearances, floored at 15 (below that, `unknown`).

Recruitment posts ("we're hiring a Property Operations Executive") are detected as a
distinct case from spam at the appearance level because real data showed they trip
every buyer-intent phrase while being the opposite of demand — see
`RECRUITMENT_PHRASES` in `domain/scoring/lexicon.ts`.

## AI analysis: the person-level rollup

Computed by `domain/scoring/lead-rollup.ts::rollupPersonScores` from every non-spam,
non-duplicate appearance a person has, and persisted onto `leads` by
`application/leads/identity-resolution.ts::recomputePersonRollup` after every ingest
(and idempotent — safe to re-run at any time, same "derived" contract as everything
else here):

- **buyerScore / sellerScore / investorScore** (0–100) — diminishing-returns sum
  (`domain/scoring/lead-rollup.ts::diminishingSum`, same shape as
  `rules-classifier.ts`'s `sumWeights`) of the matching appearances' scores. A second
  and third corroborating appearance matters far more than a tenth.
- **confidenceScore** (0–100) — appearance count (diminishing), corroboration (≥2
  appearances agreeing on the same leadType), a strong single signal, and contactability
  — a first-pass heuristic, not a calibrated model, same posture as the rules
  classifier itself.
- **aiExplanation** — a templated synthesis of the strongest contributing reason plus
  appearance count/source-type variety. Deliberately not an LLM call yet — the
  `LeadIntelligence` port (mirrors `LeadClassifier`) exists specifically so a real LLM
  synthesizer can replace this later without touching ingestion; an engagement-only
  person (no body text anywhere) is exactly the case a phrase lexicon can't help with
  and an LLM given "this profile + these appearances" could.

`priorityScore` (`domain/lead/ranking.ts`) is a separate thing again — it answers "who
should I call next," not "how good is this lead," by folding recency
(`latestAppearanceAt`) and already-worked status on top of `buyerScore`/
`confidenceScore`.

## Per-appearance axes: intent vs. quality vs. reach

Unchanged from before, still computed once per appearance and feeding the rollup above:

- **intentScore** (0–100) — how strongly the text expresses intent to transact.
- **qualityScore** (0–100) — how *workable* this appearance is: contactable, specific
  location, stated budget, specific property type.
- **reach** — post popularity (likes/comments/shares, recency-decayed at read time).
  Deliberately never mixed into intent, and never rolled up onto the person — a popular
  listing (or a popular post someone merely liked) must not outrank a real buyer.

**Engagement context** (`lead_appearances.attributes._engagement`, a reserved key — not
a canonical column) — for an `engagement_*` appearance, a denormalized snapshot of the
post it engaged with (`targetPostExternalId`, `targetPostUrl`, `targetListingTitle`,
`targetPriceRaw`, `targetLocationRaw`), projected by an optional `engagementContext`
block on the mapping profile's rules (`domain/dataset/types.ts::EngagementContextRule`),
parallel to the existing `engagement` block used for like/comment/share counts. The
target post itself is usually never ingested as its own record — this is deliberately a
cheap snapshot, not a join. `repeatEngagementCount` (how many distinct posts the same
person engaged with in the lookback window) is computed at classify time and is *not*
stored on the appearance — it only exists as classifier input, expressed as a
`scoreReasons` entry.

## Predicate language (alerting)

A small serializable boolean language stored as JSON on `alert_rules.predicate`
(`domain/alerting/predicate.ts`): `Comparison` (`field`, `op`, `value`) composed with
`AllOf` / `AnyOf` / `NotOf`. Operators include `eq/neq/gt/gte/lt/lte/in/nin/contains/
intersects/exists/within` (the last takes an ISO-8601 duration subset like `P3D` or
`PT6H`, evaluated against `now`). Deliberately has no arbitrary-expression escape hatch —
"a rule engine that can run code is a rule engine that can be exploited." `describePredicate`
renders any rule as prose so nobody has to read JSON in the admin UI. Evaluated against
the person subject built by `application/alerting/dispatch.ts::toSubject` — `leadType`,
`buyerScore`/`sellerScore`/`investorScore`/`confidenceScore`, `propertyTypes`,
`locations`, `budgetMin`/`Max` (USD-normalized), `latestAppearanceAt`, `hasContact`,
`name`. There's no `isSpam` field here anymore — a spam appearance simply never
contributes to `buyerScore` during rollup, so a person whose only appearances were spam
naturally never clears a sensible threshold.

## Currency and budget

`BudgetRange { min, max, currency }` is extracted from free text (`extractBudget`) or
trusted from a structured `priceRaw` field when present, per appearance. Stored on the
appearance as both native currency (`budgetMin/Max/Currency`) and USD-normalized
(`budgetUsdMin/Max`, via `fx_rates`, falling back to a hardcoded `FALLBACK_USD_RATES`
table when no live rate exists). The person-level `leads.budgetMin/Max/Currency/UsdMin/
UsdMax` carries forward whichever appearance most recently stated a budget (plain "most
recent wins" pick, not a scoring decision — a stated budget can change over time, and
range-merging across appearances risks a nonsensical combined range more than it risks
staleness) so cross-currency filtering and the seeded "$50k+" alert threshold work.

## Location canonicalization

Free-text location mentions ("changgu", "Denpasar, Bali") are folded onto one canonical
label via `location_aliases` / `LOCATION_ALIASES`
(`domain/scoring/extractors.ts::canonicalLocation`) so dynamic location filters in the UI
don't fragment into near-duplicates. `BALI_LOCATIONS` in `domain/scoring/lexicon.ts` is
the open list of recognized place names; "bali" alone is dropped once a specific district
is known.

## Schema drift

A **schema fingerprint** (`fingerprintSchema`) is a stable hash over the sorted
`path:type` set of a dataset's inferred field profile. When it changes, a new
`dataset_versions` row is captured and diffed against the previous one
(`diffSchema`). **Drift** (`isSchemaDrift`) is specifically *removed fields* or
*type changes* — added fields alone are additive and safe (passthrough surfaces them
automatically). A drifted dataset gets `health = schema_drift`: it keeps syncing, but the
existing mapping profile can no longer be trusted until a human reviews it.
