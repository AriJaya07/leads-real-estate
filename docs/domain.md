# Domain Glossary

Business terms and entity relationships. See [architecture.md](architecture.md) for how
these flow through the pipeline, and `domain/*/types.ts` for the authoritative type
definitions — this document explains the *why*, not the shape.

## Core entities

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
keyed by `(datasetId, sourceItemId)`. This is the replay source of truth: every lead is
re-derivable from here. Carries a `contentHash` (normalized text, for cross-dataset
duplicate detection) and `payloadHash` (whole payload, detects upstream edits).

**Mapping profile** (`mapping_profiles` table) — a declarative, versioned set of
`FieldRule`s that projects an arbitrary raw payload onto the canonical lead spine
(`CANONICAL_FIELDS` in `domain/dataset/types.ts`). Either **curated** (hand-verified,
claims a dataset via `matchPaths` — all required paths must be present) or
**auto-generated** (`proposeMapping`, held for admin review unless confidence ≥ 0.8).
A curated profile always wins over an auto-generated one for the same source kind.

**Lead** (`leads` table) — a raw record normalized and classified. Fully derived and
freely regenerable: reprocessing (new mapping, new classifier) recomputes every field
here without re-hitting the upstream API. Points at a `canonicalLeadId` when it's a
detected repost/duplicate of an earlier lead.

**Lead state** (`lead_states` table) — the human side of a lead: `status`, `assignedTo`,
`priority`, `notes`, `tags`, `bookmarked`, `firstContactedAt`. Created once
(`onConflictDoNothing`) the first time a lead is touched by the pipeline or a person, and
never overwritten by reprocessing. This split is why a mapping change or reclassification
is safe to run at any time.

**Lead event** (`lead_events` table) — append-only audit trail (`created`,
`status_changed`, `assigned`, `note_added`, `contacted`, `alerted`, `reclassified`,
`merged`). Source of funnel analytics and the "why did this change" trail in the UI.

**Alert rule** (`alert_rules` table) — a named `Predicate` (see below) plus channels,
recipients, throttle and digest settings. Tuning "what counts as a hot lead" is an admin
edit, not a deploy — see the seeded "High-intent Bali buyer" rule in
`infrastructure/db/seed.mjs`.

**Alert delivery** (`alert_deliveries` table) — the send ledger. Unique on `dedupeKey =
sha256(ruleId:leadId:channel)`, which is what stops a mapping-profile backfill from
re-alerting the sales team about months-old posts.

**Field catalog** (`field_catalog` table) — per-dataset inferred schema (path, type,
fill rate, cardinality). Drives which discovered-but-unmapped fields become dynamic
filters (`facetable`) in the admin UI without a code change.

## Intent taxonomy

`LeadIntent` = `buyer | seller | agent | other` (`domain/scoring/types.ts`).

- **buyer** — explicit intent to acquire ("looking to buy", "cari villa"). The only
  intent the sales team is paid to act on; everything downstream (ranking, the seeded
  alert rule) is tuned around it.
- **seller** — supply-side listings ("for sale", "dijual"). Tracked and scored but
  capped at intentScore ≤ 45 so it can never outrank a buyer in the inbox.
- **agent** — professional/agency listings ("our listing", "property agency"). Same
  treatment as seller but tagged separately because the follow-up differs (a private
  seller vs. an agency).
- **other** — everything that doesn't clear a buyer/seller/agent signal, or that was
  caught by the spam/recruitment gate (`isSpam = true`, intent forced to `other`,
  score 0). Recruitment posts ("we're hiring a Property Operations Executive") are
  detected as a distinct case from spam because real data showed they trip every
  buyer-intent phrase while being the opposite of demand — see `RECRUITMENT_PHRASES` in
  `domain/scoring/lexicon.ts`.

## Two independent axes: intent vs. quality vs. reach

- **intentScore** (0–100) — how strongly the text expresses intent to transact.
- **qualityScore** (0–100) — how *workable* the lead is: contactable, specific location,
  stated budget, specific property type. "I want to buy a villa" alone is high intent,
  low quality — no way to reach them yet.
- **reach** — post popularity (likes/comments/shares, recency-decayed at read time).
  Deliberately never mixed into intent; a popular listing must not outrank a real buyer
  because it got more likes.

`priorityScore` (`domain/lead/ranking.ts`) is a third, separate thing again — it answers
"who should I call next," not "how good is this lead," by folding in recency and
already-worked status on top of intent/quality.

## Predicate language (alerting)

A small serializable boolean language stored as JSON on `alert_rules.predicate`
(`domain/alerting/predicate.ts`): `Comparison` (`field`, `op`, `value`) composed with
`AllOf` / `AnyOf` / `NotOf`. Operators include `eq/neq/gt/gte/lt/lte/in/nin/contains/
intersects/exists/within` (the last takes an ISO-8601 duration subset like `P3D` or
`PT6H`, evaluated against `now`). Deliberately has no arbitrary-expression escape hatch —
"a rule engine that can run code is a rule engine that can be exploited." `describePredicate`
renders any rule as prose so nobody has to read JSON in the admin UI.

## Currency and budget

`BudgetRange { min, max, currency }` is extracted from free text (`extractBudget`) or
trusted from a structured `priceRaw` field when present. Stored on the lead as both
native currency (`budgetMin/Max/Currency`) and USD-normalized (`budgetUsdMin/Max`, via
`fx_rates`, falling back to a hardcoded `FALLBACK_USD_RATES` table when no live rate
exists) so cross-currency filtering and the seeded "$50k+" alert threshold work.

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
