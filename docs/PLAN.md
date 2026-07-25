# Bali Real Estate Lead Intelligence Platform — Architecture & Development Plan

**Status:** Proposal / planning only. No code written yet.
**Date:** 2026-07-25
**Audience:** CEO, engineering
**Codename:** DreamRue LIP (Lead Intelligence Platform)

---

## 0. Executive summary

The CEO's brief asks for two things that sound like one thing but are not:

1. **An ingestion problem** — stop hardcoding dataset IDs, auto-discover and sync whatever n8n/Apify produces.
2. **A business problem** — find people who actually want to buy property in Bali, and get the sales team onto them within minutes.

Solving (1) well does not solve (2). This plan treats (2) as the product and (1) as the substrate.

I audited the live Apify account and the existing codebase before writing this. The audit found defects that materially change the design — most importantly, **the current data mapper does not match the real dataset shape**, and **the data currently being collected is almost entirely sellers, not buyers**. Details in §1.

The central architectural recommendation is: **introduce a persistent database.** Everything the CEO asked for — dataset versioning, sync history, sync logs, health monitoring, incremental sync, dataset comparison, deduplication, lead status that survives a refresh — is a stateful requirement. The current design (fetch the whole Apify dataset on every request, classify in-memory, store lead status in browser `localStorage`) cannot express any of them. This is the one decision that unlocks the rest of the brief.

Second recommendation: **model the data as a source-agnostic pipeline with a declarative, database-stored mapping layer.** "Nothing hardcoded" is achievable, but only if field mapping, facets, filters, and columns are *data*, not TypeScript literals. §4 specifies this.

Third: **the platform should be judged on time-to-first-contact, not on dashboard features.** §2 defines the metrics.

---

## 1. Audit findings (evidence, not speculation)

I called the live Apify API with the token in `.env` and read every source file. These are facts, and several of them invalidate assumptions in the current code.

### 1.1 The data mapper is mapping fields that do not exist

`types/apify.ts` declares `authorName`, `authorProfilePicture`, `groupName`, `images[]`, `topComments[]`. The actual items in dataset `SIriprJMHjqtru3bC` (20 items, all with identical field sets) contain:

| Declared in code | Actually present in the dataset |
| --- | --- |
| `authorName` | `user.name` |
| `authorProfilePicture` | `user.profilePic` |
| `authorId` | `user.id` |
| `groupName` | `groupTitle` |
| `images: string[]` | `attachments[].photo_image.uri` (+ `attachments[].thumbnail`, `attachments[].ocrText`) |
| `topComments[]` | *(absent)* |
| *(not modeled)* | `title` — e.g. `"3 beds · 3 bath · Villa"` (14/20 items) |
| *(not modeled)* | `price` — e.g. `"IDR2,222"` (14/20) |
| *(not modeled)* | `location` — e.g. `"Denpasar, Bali"` (14/20) |
| *(not modeled)* | `facebookId`, `feedbackId`, `legacyId`, `paidPartnership`, `topReactionsCount`, `collaborators`, `textReferences`, `link` |

**Consequence today:** every lead renders `authorName: "Unknown"`, every lead has zero images, `groupName` is reverse-engineered from a URL regex, and the three richest signals in the dataset — structured `title` (bedroom/bathroom/property type), `price`, and `location` — are thrown away entirely. The classifier is re-deriving property type and location from freeform `text` with keyword matching while structured versions of the same fields sit unused in the payload.

This is the single strongest argument for the schema-inference layer in §4: a hand-written interface silently degraded to garbage the moment the upstream actor changed its output shape, and nothing in the system noticed.

### 1.2 Pagination total header is wrong

`services/apify.service.ts` reads `headers["x-total-count"]`. Apify sends `x-apify-pagination-total` (verified against a live response; the exposed headers are `X-Apify-Pagination-Total|Offset|Desc|Count|Limit`). `total` is therefore always `undefined`. Currently harmless because `fetchAllApifyItems` loops until a short page, but it means page-count UI and progress reporting have no source of truth.

### 1.3 Dataset discovery is not what it appears

- `GET /v2/datasets` returns **only named datasets** — `total: 1` on this account.
- `GET /v2/datasets?unnamed=1` returns **9**.

Any discovery implementation that omits `unnamed=1` will silently see one dataset forever. Both modes are needed: named datasets are the curated, n8n-managed ones; unnamed datasets are per-actor-run outputs.

### 1.4 n8n writes to a *named* dataset out-of-band — webhooks alone will not detect it

Dataset `SIriprJMHjqtru3bC` (`facebook-group-real-estate`):
- created `2026-07-22T06:28:52Z`, from actor run `yvmkkSdfDl3o01sWm`
- **modified `2026-07-25T06:57:15Z`** — three days later
- but the actor has only **3 runs total**, the most recent being `2026-07-24T09:23`, which wrote to a *different* dataset (`nGHqjUYDlhlxXaNGl`, 1 item)

So the named dataset is being mutated by n8n pushing items directly via the Dataset API, **not** by actor runs. An Apify "Run Succeeded" webhook — which is what `app/api/apify/webhook/route.ts` relies on — will never fire for those writes.

**Design consequence:** change detection must be **poll-based on `modifiedAt` + `itemCount`**, with webhooks as an accelerant, not the primary mechanism. This is the correct default anyway: it is self-healing, works when n8n is misconfigured, and survives missed webhook deliveries.

### 1.5 The business signal problem — we are collecting sellers

Of the 20 items in the active dataset:
- All 20 come from a single group: *"Bali Property - Villas & Land - Lease/Leasehold/Freehold"*
- Sample content is overwhelmingly **listings** (sellers/agents): *"Sanur Beachside – Three-Bedroom Villa with Private Pool"*, `title: "3 beds · 3 bath · Villa"`, `price: "IDR2,222"`
- At least one item is unrelated spam (an electrical-contractor ad)
- 10 distinct authors across 20 posts; several posts are near-identical reposts by the same author (distinct post IDs, same body text)
- All timestamps cluster in a ~4.5 hour window on 2026-01-08

**This is a supply feed, not a demand feed.** The CEO's #1 priority is *buyers*. The current source configuration cannot deliver it in volume, and no amount of scoring sophistication fixes an input that contains almost no buyers.

I am flagging this because it is the highest-leverage finding in the audit, and it is a **source strategy** fix, not a code fix. §7.1 proposes the change. It does not block anything else in this plan — the platform should be built to ingest both, since seller inventory is independently valuable (it is the matchable supply side).

### 1.6 State that cannot survive

`stores/leads-overrides.store.ts` stores lead status, notes, and bookmarks in browser `localStorage`. Its own comment acknowledges this is a placeholder. In practice: an agent marks a lead "contacted" on their laptop, a colleague on another device sees it as "new" and double-contacts the prospect. For a sales team this is not a rough edge, it is a defect that damages the customer relationship.

### 1.7 Compute model does not scale

`getAllLeads()` fetches *every* item in the dataset and runs the classifier over *all* of them on every cache miss, then filters/sorts/paginates in memory inside a server action. At 20 items this is invisible. At 50k items — one weekend of serious scraping across multiple groups — it is a multi-second, multi-megabyte operation on every cold cache, and an LLM classifier would re-bill the entire corpus each time. Classification must be **incremental and persisted**: classify each record exactly once, on ingest.

### 1.8 Security

- `.env` is correctly gitignored (`.gitignore:34`), so nothing is committed. Good.
- The live `APIFY_API_TOKEN` was read during this audit and its value now exists outside the machine's keychain, and the `users/me` response exposes the account's proxy password. **Recommend rotating the Apify token** in account settings before this goes to production, and adopting a secret manager (Vercel/Doppler/1Password) rather than a plaintext `.env` as the system of record.
- `next.config.ts` `remotePatterns` allows `**.apify.com`, but the real image URLs are `scontent-*.xx.fbcdn.net`. Images would be blocked by `next/image` even after the mapper is fixed.
- The webhook route compares the secret with `!==` — not timing-safe — and the current `.env` value is literally `change-me`.

### 1.9 Dependency audit

Declared but with **zero references** in source:

| Package | Verdict |
| --- | --- |
| `maplibre-gl`, `react-map-gl` | Remove. No map exists. Re-add if/when the demand heat-map (§8.4) is built. |
| `next-sitemap` | Remove. This is an internal tool behind auth; there is nothing to index. |
| `sharp` | Remove from `dependencies` (Next 16 bundles its own image optimizer; only needed for specific self-host setups). |
| `@hookform/resolvers` | Remove unless forms land in Phase 3; `react-hook-form` is referenced once. |
| `axios` | Remove. Replace with native `fetch` — required anyway to participate in Next's caching/instrumentation. Retry logic moves into a small typed HTTP wrapper. |

Misplaced in `dependencies` — must move to `devDependencies` (they currently ship to the production install):
`@playwright/test`, `@testing-library/*`, `jsdom`, `vitest`, `shadcn`.

Keep: `@base-ui/react` (21 refs), `lucide-react` (21), `@tanstack/react-query`, `nuqs`, `zod`, `zustand`, `next-safe-action`, `next-themes`, `sonner`, `class-variance-authority`, `tailwind-merge`, `date-fns`, `resend`, `server-only`, `shadcn` (used via `@import "shadcn/tailwind.css"` in `globals.css` — the grep for TS/TSX misses it).

Conditional: `embla-carousel-react`, `cmdk`, `react-day-picker` are each pulled in by exactly one generated shadcn component (`carousel`, `command`, `calendar`). `cmdk` and `react-day-picker` are wanted (command palette §8.5, date-range filter). `embla`/`carousel` — remove unless the lead detail view gets an image gallery, which it should (§8.3), so keep.

---

## 2. Business framing

### 2.1 What the platform is for

> Find people who intend to buy Bali property, rank them by how real that intent is, and put them in front of a salesperson fast enough to be the first responder.

In social-lead capture, **being first matters more than being best.** A buyer posting "looking for a villa in Canggu, budget 300k" in a Facebook group gets a dozen replies within the hour. Response latency is the product.

### 2.2 North-star and supporting metrics

| Metric | Definition | Target |
| --- | --- | --- |
| **North star: Time-to-first-touch (TTFT)** | Post timestamp → first outbound contact by an agent | p50 < 15 min, p90 < 60 min |
| Detection latency | Post timestamp → lead visible in platform | p90 < 10 min |
| Alert precision | Alerted leads that a human confirms are real buyers | > 60% (a noisy alert channel gets muted, and a muted channel is worth zero) |
| Buyer recall | Real buyer posts in source data that we surfaced | > 90% |
| Qualified lead volume | Buyer-intent leads/week, score ≥ threshold | Trend up; baseline TBD after §7.1 |
| Conversion | Leads → viewing booked → sale | Tracked from day one, even if manual |

### 2.3 The weekend constraint

The CEO specifically calls out weekends. Weekends are when consumers browse property. This has concrete design implications, not just a scheduling note:

- Sync cadence must be **higher on weekends** (see §5.5 adaptive scheduling), not a fixed cron.
- Alerting must reach a phone, not an inbox nobody opens on Saturday. Email is the Phase-1 channel; **WhatsApp is the channel that will actually work in Indonesia** and should be Phase 3.
- On-call rotation / round-robin assignment so weekend leads have a named owner, not a shared inbox with diffused responsibility.

### 2.4 Explicit scope boundary

This platform ingests and acts on **publicly posted content**. Two constraints follow, and they are product constraints, not legal boilerplate:

- Contact details are used **only** where the poster published them publicly and in a context inviting contact. Scraping a phone number from a "looking to buy" post and messaging that person is the intended use; harvesting profile data for bulk outreach is not.
- Facebook's Terms prohibit automated scraping. Apify is the operator of that risk today and this plan does not change that, but the platform must be **source-portable** (§3.2) so the business is not existentially coupled to one scraping vendor. Portal feeds, WhatsApp Business inbound, and the company website form are first-class sources in this design for exactly that reason.

---

## 3. Target architecture

### 3.1 Layered view

```
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION      Next.js 16 App Router · RSC · PPR             │
│  app/(dashboard) · app/(admin) · design system · SVG assets      │
├──────────────────────────────────────────────────────────────────┤
│  APPLICATION       Server Actions · Route Handlers · use cases   │
│  Zod at every boundary · next-safe-action · cacheTag/updateTag   │
├──────────────────────────────────────────────────────────────────┤
│  DOMAIN            Pure, dependency-free TypeScript              │
│  Lead · Dataset · SyncRun · ScoringPolicy · FacetCatalog         │
│  Ports: SourceConnector, Classifier, Notifier, LeadRepository    │
├──────────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE    Adapters implementing the ports               │
│  ApifyConnector · N8nConnector · Postgres/Drizzle repos          │
│  RulesClassifier | LLMClassifier · Resend/WhatsApp notifiers     │
├──────────────────────────────────────────────────────────────────┤
│  DATA              Postgres (Neon/Supabase) + pgvector           │
└──────────────────────────────────────────────────────────────────┘
```

The dependency rule is one-directional: **Domain imports nothing.** Application depends on Domain via ports. Infrastructure implements ports. Presentation depends on Application. Enforced with an ESLint boundaries rule so it does not erode.

### 3.2 The ingestion pipeline

```
 DISCOVER → PROBE → INGEST → NORMALIZE → DEDUPE → ENRICH → SCORE → INDEX → SERVE → ACT
```

| Stage | Responsibility | Key output |
| --- | --- | --- |
| **Discover** | Enumerate everything the connector can see (`/v2/datasets` both named and `unnamed=1`; actor runs; key-value stores) | `dataset` registry rows |
| **Probe** | Cheap change check: `modifiedAt`, `itemCount`, ETag | `needsSync: boolean` |
| **Ingest** | Pull only new items from the watermark offset | `raw_record` rows (payload stored verbatim) |
| **Normalize** | Apply the dataset's **mapping profile** → canonical shape | `lead` draft |
| **Dedupe** | Exact (`source_id`) + near-dup (content hash, author+text similarity) | dedupe verdict, `canonical_lead_id` |
| **Enrich** | Parse contacts, budget, locations, property attributes; geocode | structured fields |
| **Score** | Intent classification + quality scoring via `Classifier` port | `intent`, `score`, `reasons[]` |
| **Index** | Materialize facets, full-text vectors, embeddings | search-ready |
| **Serve** | Query API for the dashboard | filtered/sorted/paginated |
| **Act** | Alert rules → notify → assign → follow-up | outbound |

Every stage is **idempotent and resumable**. Reprocessing is a first-class operation: because `raw_record` keeps the original payload verbatim, changing the mapping profile or swapping the classifier re-derives every lead **without re-hitting Apify** — no re-scrape cost, no rate limits, no data loss. This is what makes the "AI-ready" requirement real rather than aspirational: dropping in an LLM classifier later is a backfill job, not a migration.

### 3.3 The decision: add a database

**Recommendation: Postgres (Neon serverless or Supabase) + Drizzle ORM.**

Why this is not optional:

| CEO requirement | Requires persistence? |
| --- | --- |
| Dataset versioning | Yes — versions are rows |
| Dataset history | Yes |
| Sync history / logs / monitoring | Yes |
| Incremental sync | Yes — watermarks must persist |
| Dataset comparison | Yes — need both snapshots simultaneously |
| Dataset health status | Yes — needs time series |
| Deduplication | Yes — need to know what was already seen |
| Lead status / notes / assignment | Yes — must survive refresh, must be shared across devices |
| Follow-up priorities | Yes |
| AI lead scoring at scale | Yes — classify once, not per request |

Why Postgres specifically: relational integrity for the registry, `jsonb` for the raw payloads and schema-flexible fields (`GIN`-indexable, which makes dynamic filtering on arbitrary discovered fields genuinely fast), native full-text search for Phase 1 lead search, and `pgvector` for Phase 4 semantic search — one datastore covers all four needs. Drizzle over Prisma: lighter serverless cold-start, SQL-transparent, first-class `jsonb` typing.

**Alternative considered and rejected:** keeping everything stateless and caching harder. It fails on dedupe, history, comparison, and shared lead status — roughly two-thirds of the brief. Rejected.

**Deliberately deferred:** a separate job queue (Inngest/Trigger.dev). Phase 1 uses Vercel Cron + Route Handlers + `after()`, which handles this volume comfortably. Revisit if a single sync exceeds the platform function timeout — the sync engine is written as resumable chunks (§5.4) specifically so this migration is a config change, not a rewrite.

### 3.4 Canonical data model

Core tables (illustrative, not final DDL):

```
source                  -- a connector instance: "Apify: FB Groups", "n8n: IG", "Website form"
  id, kind, name, config jsonb, credentials_ref, enabled, created_at

dataset                 -- a discovered dataset within a source
  id, source_id, external_id, name, title, kind,
  status ('active'|'archived'|'error'|'paused'),
  item_count, last_modified_at, discovered_at,
  mapping_profile_id, health_status, health_checked_at,
  sync_cursor jsonb, auto_sync_enabled, sync_interval_seconds

dataset_version         -- immutable snapshot for versioning + comparison
  id, dataset_id, version_no, item_count, schema_fingerprint,
  field_profile jsonb, captured_at, sync_run_id

sync_run                -- one execution
  id, dataset_id, trigger ('cron'|'webhook'|'manual'|'discovery'),
  status, started_at, finished_at,
  items_seen, items_new, items_updated, items_duplicate, items_failed,
  error_summary, duration_ms

sync_event              -- structured log lines for the admin log viewer
  id, sync_run_id, level, stage, message, context jsonb, at

raw_record              -- verbatim upstream payload, the replay source of truth
  id, dataset_id, source_item_id, payload jsonb,
  content_hash, first_seen_at, last_seen_at, sync_run_id

mapping_profile         -- DECLARATIVE field mapping; the "nothing hardcoded" mechanism
  id, name, source_kind, version, rules jsonb, auto_generated, confidence

field_catalog           -- inferred schema per dataset, drives dynamic UI
  id, dataset_id, path, inferred_type, nullable, cardinality,
  sample_values jsonb, fill_rate, facetable, first_seen_version

lead                    -- canonical, normalized, scored
  id, raw_record_id, dataset_id, canonical_lead_id (self-FK, dedupe),
  external_url, author_*, posted_at, body,
  intent, intent_score, quality_score, score_reasons jsonb,
  property_types text[], locations text[], location_geo,
  budget_min, budget_max, budget_currency,
  contact jsonb, attributes jsonb,     -- attributes = dynamic per-dataset extras
  search_tsv tsvector, embedding vector(1536)

lead_state              -- human-owned, survives all reprocessing
  lead_id, status, assigned_to, priority, notes, tags text[],
  first_contacted_at, updated_at, updated_by

lead_event              -- append-only audit + funnel analytics
  id, lead_id, type, actor, payload jsonb, at

alert_rule              -- configurable priority rules, no code change to tune
  id, name, enabled, predicate jsonb, channels text[], throttle_seconds

alert_delivery          -- what was sent, to whom, dedupe ledger
  id, alert_rule_id, lead_id, channel, status, sent_at, dedupe_key
```

**Critical separation:** `lead` (derived, freely regenerable) vs. `lead_state` (human-authored, sacred). Reprocessing the whole corpus with a new classifier must never destroy an agent's notes or an assignment. This split is what makes reprocessing safe.

---

## 4. Dynamic schema engine — how "nothing hardcoded" actually works

This is the heart of the brief, and the audit finding in §1.1 is its justification. Three cooperating pieces:

### 4.1 Schema inference (profiling)

On every sync, sample up to N records and walk every JSON path:

```
{ path: "user.name",  type: "string", fillRate: 1.00, cardinality: 10,  samples: [...] }
{ path: "price",      type: "string", fillRate: 0.70, cardinality: 4,   samples: ["IDR2,222"] }
{ path: "attachments[].photo_image.uri", type: "string[]", fillRate: 1.00 }
```

Output → `field_catalog`, plus a **schema fingerprint** (stable hash of the sorted path+type set).

**Fingerprint change ⇒ new `dataset_version` ⇒ admin notification.** Had this existed, §1.1 would have been a Slack alert on day one instead of a silent data-quality collapse.

### 4.2 Mapping profiles (declarative, stored in DB, editable in admin)

A mapping profile maps discovered paths onto canonical fields:

```jsonc
{
  "name": "apify/facebook-groups-scraper@v2",
  "rules": {
    "externalId":   { "from": ["id", "legacyId"] },
    "externalUrl":  { "from": ["url", "facebookUrl", "inputUrl"] },
    "authorName":   { "from": ["user.name", "authorName"], "default": "Unknown" },
    "authorAvatar": { "from": ["user.profilePic", "authorProfilePicture"] },
    "groupName":    { "from": ["groupTitle", "groupName"],
                      "fallback": { "regex": "groups/([^/?]+)", "on": "inputUrl" } },
    "postedAt":     { "from": ["time", "timestamp"], "transform": "toIso8601" },
    "body":         { "from": ["text"] },
    "images":       { "from": ["attachments[].photo_image.uri", "attachments[].thumbnail", "images[]"],
                      "transform": "flattenUnique" },
    "listingTitle": { "from": ["title"] },
    "priceRaw":     { "from": ["price"], "transform": "parseMoney" },
    "locationRaw":  { "from": ["location"] },
    "engagement":   { "likes": "likesCount", "comments": "commentsCount", "shares": "sharesCount" }
  },
  "passthrough": true   // unmapped fields land in lead.attributes
}
```

Key properties:
- **`from` is an ordered candidate list.** The same profile handles both the old and new actor output — this is how upstream shape drift stops being an outage.
- **`passthrough: true`** means unmapped discovered fields are preserved in `lead.attributes` (jsonb) and become filterable automatically. New upstream fields appear in the UI with zero code changes. This is the literal implementation of "new categories should automatically appear throughout the application."
- Profiles are **versioned**. Changing one triggers a re-normalize backfill from `raw_record` — no re-scrape.
- **Auto-generation:** on a first-seen dataset, propose a profile by fuzzy-matching discovered paths against canonical field synonyms, with a confidence score. Admin reviews and accepts in the UI. Never silently applied below a confidence floor — a wrong auto-map is worse than an unmapped dataset, because it looks like it worked.

### 4.3 Facet catalog → dynamic UI

Facets are derived from data, never enumerated in code:

- **Property types:** `SELECT DISTINCT unnest(property_types)` + counts. A dataset introducing `"penthouse"` makes a Penthouse filter chip appear automatically.
- **Locations / districts / cities:** a normalized location table built from observed values, with an alias map (`changgu`→`canggu`, `Denpasar, Bali`→`Denpasar`) so filters do not fragment. The alias map lives in the DB and is admin-editable.
- **Any `field_catalog` entry marked `facetable`** (low cardinality, high fill rate — auto-flagged, admin-overridable) becomes an available filter, table column, and group-by dimension.

The frontend consumes a **filter descriptor** from the API and renders controls generically:

```ts
type FacetDescriptor =
  | { key: string; label: string; kind: "enum";  options: {value: string; label: string; count: number}[] }
  | { key: string; label: string; kind: "range"; min: number; max: number; unit?: string }
  | { key: string; label: string; kind: "date";  min: string; max: string }
  | { key: string; label: string; kind: "text" }
  | { key: string; label: string; kind: "bool" }
```

One `<DynamicFilterBar descriptors={...}/>` renders any dataset. Same descriptors drive dynamic table columns, chart dimensions, and report builders. Zod schemas for filter validation are **generated at request time** from the descriptors, so type safety holds without hardcoding.

**The honest caveat:** "fully dynamic" applies to *facets, filters, columns, and categories*. A small canonical core (`id`, `postedAt`, `body`, `authorName`, `intent`, `score`) stays typed and stable, because the alerting and scoring logic must mean something specific by "buyer intent." Total schemalessness would make the business logic unwritable. The dynamic layer sits **around** a stable spine — that is the design, and it is deliberate.

---

## 5. Sync engine

### 5.1 Discovery

Runs on a schedule (default 15 min) and on demand:

1. `GET /v2/datasets?desc=1&limit=…` (named) **and** `?unnamed=1` (run outputs) — both, per §1.3, paginating fully.
2. `GET /v2/acts/{actorId}/runs` for run→dataset lineage and run status.
3. Upsert into `dataset`. New rows get `status='active'`, auto-inferred schema, proposed mapping profile, and an admin notification.
4. Datasets that vanish upstream are marked `status='missing'` — never hard-deleted, because history matters.

Discovery filters (which actors/name patterns to track) are **admin-configured rows**, not env vars.

### 5.2 Change detection

Cheap probe before any expensive pull:

```
changed = dataset.modifiedAt > stored.last_modified_at
       OR dataset.itemCount  != stored.item_count
```

Per §1.4 this is the primary mechanism and correctly catches n8n's direct pushes. Webhooks (`/api/webhooks/apify`) are an *accelerant* that trigger an immediate probe — they lower latency; they are never the sole path. Missed webhook = data arrives one poll cycle later, not never.

### 5.3 Incremental sync

Apify datasets are append-only and offset-stable, which makes the watermark trivial and reliable:

```
cursor = { lastOffset: 1840, lastItemCount: 1840, lastSyncedAt: ... }
fetch /datasets/{id}/items?offset=1840&limit=500&clean=true&format=json
```

- Read `x-apify-pagination-total` (**not** `x-total-count` — §1.2) for true totals and progress.
- If `itemCount < cursor.lastItemCount`, the dataset was truncated/rebuilt → full resync, new `dataset_version`.
- Manual "Full resync" available in admin for recovery.

### 5.4 Chunked, resumable execution

A sync run processes in batches of ~500 items, committing the cursor after each batch. A timeout, deploy, or crash mid-run resumes from the last committed cursor. This is what keeps a 50k-item backfill inside serverless limits without a queue, and what makes the later move to a queue a config change.

### 5.5 Adaptive scheduling

Per-dataset base interval, admin-configurable, auto-tuned:

- Datasets that changed on recent polls → poll faster (floor 2 min)
- Quiet datasets → back off (ceiling 6 h)
- **Weekend boost:** configurable multiplier during Fri 18:00 – Sun 23:59 WITA (§2.3)
- Consecutive failures → exponential backoff + `health='degraded'` → `'error'` after N

### 5.6 Deduplication

Three layers, because §1.5 shows near-duplicate reposts are real:

1. **Exact:** `(dataset_id, source_item_id)` unique constraint.
2. **Cross-dataset content hash:** normalized-text SHA-256 — catches the same post ingested via two overlapping groups.
3. **Near-duplicate:** same author + high text similarity (trigram / later embedding cosine) within a time window → linked via `canonical_lead_id`. Duplicates are **linked, not deleted**; the UI collapses them with a "3 similar posts" affordance, because repost frequency is itself an intent signal.

### 5.7 Health model

Each dataset carries a computed health status surfaced as a traffic light in admin:

| Status | Condition |
| --- | --- |
| `healthy` | Last sync succeeded, within expected interval, schema fingerprint stable |
| `stale` | No new items for > 3× expected cadence |
| `degraded` | Recent failures, partial syncs, or normalization error rate > 5% |
| `schema_drift` | Fingerprint changed since last accepted version — **needs review** |
| `error` | Consecutive failures beyond threshold |

`schema_drift` is the status that would have caught §1.1.

### 5.8 Dataset comparison

Compare any two datasets or two versions of one dataset, showing: item counts, schema diff (added/removed/changed fields), overlap ratio via content hashes, intent distribution delta, top locations/property types delta, quality-score distribution. This directly serves "which of these n8n runs actually produced better leads?"

---

## 6. Scoring & AI readiness

### 6.1 The port

```ts
export interface LeadClassifier {
  readonly id: string;         // "rules@3" | "llm-opus@1"
  classify(input: ClassifierInput): Promise<Classification>;
}

export interface Classification {
  intent: LeadIntent;
  intentScore: number;               // 0-100
  qualityScore: number;              // 0-100, distinct from intent
  propertyTypes: string[];           // open vocabulary, not a closed enum
  locations: string[];
  budget: BudgetRange | null;
  contact: ContactInfo;
  reasons: ScoreReason[];            // explainability — required, not optional
  classifierId: string;
  classifiedAt: string;
}
```

Every lead stores which classifier produced it. Re-running a new classifier over history is a backfill job. Two classifiers can run in **shadow mode** — v2 scores recorded but not shown — so a new model is validated against real outcomes before it drives alerts.

### 6.2 v1 — rules (Phase 2), improved over the current implementation

Keep the keyword approach but fix its known weaknesses:

- **Use the structured fields** the current code ignores: `title` (`"3 beds · 3 bath · Villa"` → beds/baths/type without any NLP), `price`, `location`. Structured beats regex-on-freeform every time.
- **Phrase-level, negation-aware matching.** Today `countKeywordHits` does `lower.includes(kw)` — `"looking for"` matches inside *"not looking for buyers"*, and `"budget"` matches a seller writing *"suits any budget"*. Use token-boundary matching with a negation window.
- **Bilingual weighting.** Indonesian buyer phrases (`cari`, `mau beli`, `butuh`, `dicari`, `nyari`) are currently pooled with English at equal weight; they should be weighted and expanded separately, with language detected per post.
- **Demote seller/agent signals explicitly.** A post with `price` + `title` + listing-shaped body is inventory, not demand. Today engagement adds score regardless of intent, so a popular *listing* can outrank a genuine buyer.
- **Drop the engagement term from intent scoring** and keep it as a separate `reach` signal. Engagement measures post popularity, not buying intent, and conflating them corrupts the ranking.
- **Contact extraction hardening.** The current `PHONE_REGEX` matches loosely and will capture dates, prices, and post IDs as phone numbers; and `contactInfo.whatsapp` falls back to `phones[0]`, asserting a WhatsApp number that was never stated. Use `libphonenumber-js` with `ID` as default region.
- **Spam/irrelevance filter** — §1.5's electrical-contractor ad should never reach a salesperson.

Every rule contributes a `ScoreReason` (`{code, label, weight, evidence}`) so the UI can show *"scored 82 because: explicit buy phrase 'looking to buy' (+30), budget stated USD 300k (+20), location Canggu (+15)."* Agents trust a score they can see the reasoning for; they ignore a naked number.

### 6.3 v2 — LLM (Phase 4)

Batched classification on ingest (classify once, never per request — §1.7), using a structured-output schema mirroring `Classification`. Cost is bounded because ingest volume is bounded and results are persisted. Rules stay as the fallback when the API is unavailable or over budget, so the platform degrades rather than stops.

Extends naturally to: AI summaries per lead, suggested first-reply drafts (agent-edited, never auto-sent), semantic search over `embedding`, smart categorization proposing new facet values, sentiment/urgency detection.

### 6.4 Ranking ≠ scoring

The dashboard ranks by a **priority** function combining intent score, recency decay, contactability, and dataset trust — tunable per company without retraining anything. Recency decay matters enormously here: a 95-score lead from three days ago is worth less than an 80-score lead from ten minutes ago, because someone else already called the first one.

---

## 7. Lead acquisition & alerting

### 7.1 Fixing the source mix (highest business impact — see §1.5)

Recommendations for the n8n side. These are configuration/workflow changes, not application code, and they can proceed in parallel with all engineering work:

1. **Add buyer-side groups and queries.** Target groups where demand is posted — expat/relocation groups, "Bali housing wanted", investment communities — not listing groups.
2. **Add keyword-driven search sources**, not just group dumps: `looking for villa Bali`, `cari villa Bali`, `want to buy land Canggu`, etc.
3. **Mine comments, not just posts.** On a listing post, the *commenters* asking "price?" / "still available?" / "DM sent" are the buyers. This is likely the single richest untapped seam in the existing pipeline — and note the current scraper output contains **no** `topComments`, so the actor's comment scraping is either disabled or unsupported in this configuration. Worth verifying first.
4. **Instagram** — the brief mentions IG but no IG source exists yet. Hashtag/location-tag monitoring for Bali property.
5. **Keep the seller feed.** It is the supply inventory to match buyers against, and buyer/seller matching is a natural Phase 4+ product.

### 7.2 Alert rules engine

Rules are DB rows evaluated on ingest, not `if` statements:

```jsonc
{
  "name": "High-intent Bali buyer",
  "predicate": {
    "all": [
      { "field": "intent", "op": "eq",  "value": "buyer" },
      { "field": "intentScore", "op": "gte", "value": 70 },
      { "field": "postedAt", "op": "within", "value": "PT6H" },
      { "any": [
        { "field": "propertyTypes", "op": "intersects", "value": ["villa","land","commercial"] },
        { "field": "budgetMin", "op": "gte", "value": 100000 }
      ]}
    ]
  },
  "channels": ["email", "whatsapp"],
  "throttleSeconds": 300
}
```

The CEO's "main priority" cohort ships as a **seeded default rule**, editable in admin without a deploy. Current thresholds live in `features/leads/lib/priority.ts` as constants requiring a code change to tune; they become row values.

### 7.3 Delivery

- **Dedupe ledger** (`alert_delivery.dedupe_key`) so the same lead never alerts twice, even across retries or reprocessing. Critical: without it, a mapping-profile backfill would re-alert the entire history.
- **Throttling + digest rollup** — 40 leads in five minutes becomes one digest, not 40 pings.
- **Channels behind a `Notifier` port:** Email (Resend, Phase 1) → WhatsApp Business API (Phase 3, the channel that will actually be read on a Saturday) → Slack/Telegram → in-app + Web Push.
- **Assignment & escalation:** round-robin or rule-based owner assignment on alert; unacknowledged after N minutes → escalate. This is what converts a notification into a contact.
- Every alert deep-links to the lead detail view with the original post one click away.

---

## 8. Frontend architecture & UX

### 8.1 Next.js 16 specifics

The project runs **Next 16.2.11**, and per `AGENTS.md` these APIs differ from older Next. Verified against the bundled docs in `node_modules/next/dist/docs`:

- **Enable `cacheComponents: true`** in `next.config.ts`. This turns on Cache Components + PPR-by-default and unlocks `use cache` / `cacheLife` / `cacheTag`.
- **Replace `unstable_cache`** — the docs state plainly it "has been replaced by `use cache` in Next.js 16." `features/leads/lib/get-all-leads.ts` uses it today.
- **Cache keys come from arguments**, which is exactly what dataset switching needs:
  ```ts
  async function getLeadFacets(datasetId: string) {
    'use cache'
    cacheLife('minutes')
    cacheTag(`dataset:${datasetId}:facets`)
    …
  }
  ```
  Per-dataset tags mean syncing dataset A never invalidates dataset B's cache.
- **`revalidateTag(tag, 'max')` in Route Handlers** (webhook/sync completion — stale-while-revalidate); **`updateTag(tag)` in Server Actions** (agent changes lead status — read-your-own-writes). The docs are explicit: `updateTag` is Server-Actions-only. The current webhook calls `revalidateTag(LEADS_CACHE_TAG, { expire: 0 })`; the Next 16 signature takes a profile string as the second argument.
- **PPR/streaming:** static shell (nav, chrome, cached aggregates) renders instantly; per-user and filter-dependent content streams inside `<Suspense>`. Filters live in `searchParams`, which is a runtime API — so filtered result lists must sit inside Suspense boundaries.
- **`after()`** for post-response work (audit events, alert dispatch) so the webhook returns to Apify immediately instead of blocking on email delivery, as it does today.
- **`'use cache: private'` / `'use cache: remote'`** are available if per-user or cross-instance durable caching is needed later; the docs note `use cache` is in-memory and may not persist across serverless instances.
- **Route Handlers follow the page prerendering model** when Cache Components is on — sync/admin API routes must be explicit about being dynamic.
- **Fix `images.remotePatterns`** to allow `**.fbcdn.net` and `**.cdninstagram.com` (§1.8), or proxy images server-side — the better option, since Facebook CDN URLs are signed and expire.

### 8.2 Information architecture

```
/                         → redirect to /leads
/leads                    Lead Inbox — the daily driver
/leads/[id]               Lead detail (parallel route → modal on desktop)
/pipeline                 Kanban by status; drag to advance
/intelligence             Market intelligence: demand heat-map, trends, locations
/reports                  Saved views, exports, scheduled digests
/admin/datasets           Registry: list, search, health, activate/archive
/admin/datasets/[id]      Metadata, schema, versions, sync history, logs
/admin/datasets/compare   Side-by-side comparison
/admin/sources            Connectors + discovery config
/admin/mapping/[id]       Mapping profile editor (visual field mapper)
/admin/alerts             Alert rules + delivery history
/admin/sync               Global sync monitor, schedules, live status
/admin/team               Users, roles, assignment rotation
```

**Global dataset scope selector** in the top bar — switches active dataset(s), persisted per user, reflected in URL for shareable links, with an "All datasets" union mode. Every page reacts. This is what replaces the env-var dataset switch.

### 8.3 The Lead Inbox

The screen the sales team lives in. Design principles:

- **Triage-first, not browse-first.** Default view = "New, high-intent, last 24h, unassigned," sorted by priority. The default view *is* the product.
- **Density with a switch.** Table view (scannable, dynamic columns) ↔ card view (visual, images). Table is the default for triage; cards for review.
- **Score with reasons visible** — the `ScoreReason[]` chips from §6.2, not a bare number.
- **Contact affordances are the primary CTA.** One-click WhatsApp deep-link, copy phone, open original post. Every one logs a `lead_event` and stamps `first_contacted_at` — that is how TTFT (§2.2) gets measured without asking anyone to fill in a form.
- **Keyboard-first:** `j/k` navigate, `e` archive, `a` assign, `c` contact, `/` search, `⌘K` command palette.
- **Optimistic status updates** via Server Actions + `updateTag`, replacing the `localStorage` store in §1.6.
- **Saved views** as first-class objects, shareable by URL.

### 8.4 Market intelligence

Aggregates that answer the CEO's questions directly: demand-vs-supply by location (heat-map over Bali), trending locations week-over-week, property-type demand mix, budget distribution, buyer-activity heat-map by day/hour (validates and quantifies the weekend hypothesis rather than assuming it), lead-quality trend, source performance (which group/dataset yields converting leads — this is what tells the CEO where to spend scraping budget).

All charts are driven by facet descriptors (§4.3), so new dimensions appear without new chart code. Per the `dataviz` guidance, charts use a consistent accessible palette that works in light and dark.

### 8.5 Design system

- **Foundation:** Tailwind v4 + `@base-ui/react` (already the primary primitive at 21 references) + the existing shadcn CSS layer. Keep — no framework churn.
- **Tokens:** semantic (`--color-intent-buyer`, `--color-score-high`, `--color-health-degraded`), not raw hex, defined once in `globals.css` and dark-mode aware.
- **Typography:** replace the default Geist pairing with a distinct display face for headings/numerics — the "premium" feel the CEO asks for comes mostly from type and spacing discipline, not decoration.
- **Component tiers:** `ui/` primitives (unbranded) → `common/` composed (DataTable, FilterBar, StatCard, ScoreBadge, HealthPill, EmptyState, PageHeader) → `features/*/components` (domain-specific). A component appearing in two features moves up a tier.
- **Custom SVG assets** in `components/icons/` (property-type icons: villa, land, apartment, hotel, commercial…) and `components/illustrations/` (empty states, onboarding, error states, dashboard decorations) as typed React components with `currentColor` so they theme automatically. A generation script keeps the barrel exports in sync.
- **Motion:** restrained and purposeful — new-lead arrival, score reveal, sync progress. No decorative animation.

### 8.6 Target folder structure

```
app/
  (dashboard)/          leads, pipeline, intelligence, reports
  (admin)/              datasets, sources, mapping, alerts, sync, team
  api/
    webhooks/apify/     accelerant trigger
    cron/sync/          scheduled sync entry
    cron/discover/      scheduled discovery entry
src/
  domain/               PURE. entities, value objects, ports, policies
    lead/ dataset/ sync/ scoring/ alerting/
  application/          use cases, orchestration, Zod boundary schemas
  infrastructure/
    apify/ n8n/ db/ (schema, repositories, migrations) classifiers/ notifiers/
  presentation/
    components/ ui/ common/ charts/ icons/ illustrations/
    features/ leads/ datasets/ sync/ intelligence/ admin/
    hooks/ providers/ stores/
  shared/               config, constants, utils, result types, errors
```

Feature folders keep their internal `components/ hooks/ actions/ lib/` convention — the existing `features/leads/` layout is sound and generalizes well.

---

## 9. Environment variables

**Principle:** env holds *secrets and deployment identity only*. Everything operational moves to the database and the admin UI — that is precisely the CEO's "never edit env vars to manage datasets."

### Keep

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | **New.** Postgres connection. |
| `APIFY_API_TOKEN` | Secret. **Rotate before production (§1.8).** |
| `APIFY_WEBHOOK_SECRET` | Secret. Replace the `change-me` value; compare with `timingSafeEqual`. |
| `CRON_SECRET` | **New.** Authenticates scheduled sync/discovery invocations. |
| `RESEND_API_KEY` | Secret. |
| `RESEND_FROM_EMAIL` | Deployment identity (verified sending domain). |
| `NEXT_PUBLIC_SITE_URL` | Absolute URLs in emails/webhooks. |
| `AUTH_SECRET` | **New.** Session signing — this becomes a multi-user internal tool. |

### Remove

| Variable | Why |
| --- | --- |
| `APIFY_DATASET_ID` | **The entire point of the brief.** Replaced by the dataset registry. |
| `APIFY_ACTOR_ID` | Actors are discovered and stored as `source` rows. |
| `APIFY_API_BASE_URL` | A constant, not configuration. Move to `shared/constants`. |
| `CONTACT_EMAIL_TO` | Becomes recipient rows on alert rules, per-rule and per-team. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Currently unused (`maplibre`/`react-map-gl` have zero references). Re-add only with the heat-map, and note it embeds an API key in the client bundle — proxy the tile requests instead. |

Config validation stays Zod-based (`config/env.ts` is a good pattern) but should split `server` vs `client` schemas and fail fast at startup.

---

## 10. Delivery plan

Sequenced so the CEO sees value early and each phase is independently shippable. Estimates assume one focused engineer.

### Phase 0 — Foundation & cleanup (~3 days)

- Provision Postgres; add Drizzle; initial migration for the core schema (§3.4)
- Rotate the Apify token; move to a secret manager
- Dependency cleanup per §1.9; move test deps to `devDependencies`
- Enable `cacheComponents: true`; migrate `unstable_cache` → `use cache`
- Fix `images.remotePatterns`; add layer-boundary ESLint rule
- Auth (internal, email-link or SSO) + roles: `admin` / `agent`

**Done when:** app boots against Postgres, `pnpm build` clean, zero unused deps, no dataset ID anywhere in env.

### Phase 1 — Dataset registry & sync engine (~1 week)

- Apify connector behind the `SourceConnector` port (native `fetch`, correct pagination header)
- Discovery job (named + `unnamed=1`), `dataset` registry, `raw_record` ingestion
- Incremental sync with watermark cursor + chunked resumable batches
- `sync_run` / `sync_event` history and logs; health computation
- Cron routes + webhook accelerant; `after()` for post-response work
- Admin: dataset list, search, detail, sync history, logs, manual sync, activate/archive, interval config

**Done when:** a new n8n-produced dataset appears in admin within 15 minutes with zero human action, and its sync history is inspectable.

### Phase 2 — Dynamic normalization & lead core (~1.5 weeks)

- Schema inference, `field_catalog`, fingerprinting, drift detection
- Mapping profiles + auto-proposal + visual mapping editor
- **Correct mapper for the real Apify shape (§1.1)** — including `title`/`price`/`location`
- Normalization + 3-layer dedupe; `lead` / `lead_state` split
- Rules classifier v2 (§6.2) with `ScoreReason` explainability
- Facet catalog → dynamic filter descriptors → generic filter/table/column rendering
- Reprocess-from-raw backfill job

**Done when:** every lead shows a real author name and images; changing a mapping profile re-derives all leads without touching Apify; a new property type in the data appears as a filter with no code change.

### Phase 3 — Lead Inbox & alerting (~1.5 weeks)

- Redesigned Lead Inbox: triage default, table/card, keyboard nav, saved views
- Lead detail with reasons, images, dedupe cluster, contact CTAs, event timeline
- Pipeline kanban; assignment + round-robin
- Alert rules engine, dedupe ledger, throttling, digests
- Email channel; **WhatsApp channel**; escalation on no-ack
- TTFT instrumentation and dashboard

**Done when:** a high-intent buyer post reaches a named agent's phone in under 10 minutes, and TTFT is measured automatically.

### Phase 4 — Intelligence & AI (~2 weeks)

- Market intelligence dashboards; dataset comparison UI; reports/export/scheduled digests
- LLM classifier behind the port, shadow-mode validated, batch backfill
- Embeddings + `pgvector` semantic search; AI summaries; suggested first replies
- Duplicate detection upgraded to embedding similarity

**Done when:** LLM scoring is swappable by config, and comparison shows which source produces converting leads.

### Continuous

Vitest for domain/normalization/scoring (pure functions — cheap, high-value; a fixture suite built from the real payloads in §1.1 would have caught that bug); Playwright for the critical triage path; schema-drift alerts; sync-failure alerts.

---

## 11. Risks & mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Source data contains few buyers (§1.5)** | Platform works, business goal missed | §7.1 source strategy — start immediately, it is parallel to and independent of engineering |
| Facebook/Apify blocking or ToS enforcement | Ingestion stops | Source-agnostic ports; add portal feeds, WhatsApp inbound, website forms as sources |
| Upstream schema drift | Silent data corruption (already happened) | Fingerprinting + drift alerts + candidate-list mappings + raw replay |
| Alert fatigue | Team mutes alerts; platform value → 0 | Precision target ≥60%, throttling, digests, per-user thresholds, weekly precision review |
| Over-engineering the "everything dynamic" layer | Slow delivery, complexity | Stable canonical spine + dynamic periphery (§4.3 caveat); ship Phase 1–3 before Phase 4 |
| Scraping cost growth | Budget | Per-source cost tracking; source-performance report drives spend |
| Serverless timeouts on large syncs | Failed syncs | Chunked resumable batches (§5.4); queue migration path pre-planned |
| Contact-data misuse | Reputational/legal | Public-source-only policy, audit log on every contact action, no bulk auto-outreach |

---

## 12. Decisions needed before Phase 0

1. **Database host** — Neon (serverless Postgres, generous free tier, great with Vercel) vs Supabase (Postgres + auth + storage bundled). Recommendation: **Supabase** if you also want managed auth and image storage; **Neon** if you want the leanest thing that works. Either is fine; Neon is my default.
2. **Deployment target** — Vercel assumed (Cron, `after()`, PPR all first-class). Confirm.
3. **Auth** — internal-only with email magic link is simplest. Do you need Google SSO?
4. **WhatsApp** — Business API access requires a Meta business account and approval, with lead time. Worth starting the application now if it is wanted in Phase 3.
5. **LLM budget** — a rough per-month ceiling determines whether Phase 4 classifies everything or only borderline cases.
6. **n8n access** — can engineering see/modify the n8n workflows? §7.1 depends on it, and it is the highest-business-impact item in this document.
7. **Existing lead status data** — is anything in `localStorage` worth migrating, or is it all disposable test data?

---

## 13. What this plan deliberately does not do

- **No microservices.** One Next.js app + one Postgres. The complexity is in the data model, not the deployment topology.
- **No separate job queue in Phase 1.** Cron + resumable chunks is sufficient at this volume; the migration path exists if it is not.
- **No CRM rebuild.** Pipeline tracking stops at "contacted → qualified → viewing booked." If the company adopts a real CRM, this platform feeds it rather than competing with it.
- **No custom ML training.** Rules → LLM covers the need. Training a model on a few thousand posts would underperform a well-prompted LLM.
- **Nothing is deleted, ever.** Raw payloads, dataset versions, and sync history are append-only. Storage is cheap; being unable to answer "what did this look like last Tuesday" is not.
