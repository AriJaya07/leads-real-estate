# Product Requirements

## Problem

Property buyers in Bali announce intent in public Facebook/Instagram groups ("looking to
buy a villa in Canggu, budget $300k") long before they ever reach an agent. Whoever
replies first tends to win the deal. The sales team needs those posts surfaced,
prioritized, and routed fast enough to be the first responder — not buried under the
much larger volume of seller listings and agency posts in the same groups.

## Users

- **Agent** (role `agent`) — works the inbox: filters/searches leads, claims and
  contacts them, logs notes, tracks status through a pipeline.
- **Admin** (role `admin`) — everything an agent can do, plus: manages team accounts
  (`/admin/team`), reviews/approves dataset mapping profiles, monitors dataset health,
  tunes alert rules and thresholds (`/admin/datasets`).

No public-facing or buyer-facing surface exists — this is entirely an internal sales
tool.

## Core user stories (implemented)

- As an agent, each lead is a **person**, not a post — the same Facebook/Instagram
  account posting in multiple groups, showing up as both a post author and a Post Liker,
  or appearing across Facebook and Instagram, is one lead with every source it was found
  in listed, not N separate inbox items. Deterministic identity match on
  `facebookId`/`instagramId`/`profileUrl` (never fuzzy name matching) —
  `domain/lead/identity.ts`, `application/leads/identity-resolution.ts`.
- As an agent, I see an inbox of leads ranked by priority (buyer score + confidence,
  recency weighted) by default, so the most contactable, most-real, most-recently-active
  buyer is always at the top — `triageFilters()` in
  `application/leads/filters.schema.ts` defaults to `leadType=buyer, status=new,
  sort=priority`.
- As an agent, I can filter by lead type, status, property type, location, source group,
  record kind (post/comment/like), budget range, contact-availability, and any
  dynamically-discovered attribute from the raw data, with results paginated and
  sortable — `application/leads/lead-queries.ts`.
- As an agent, I see *why* a lead scored the way it did: `scoreReasons` (specific
  phrases, budget evidence, location match) on every source it came from, plus a
  person-level `aiExplanation` synthesizing across everything they've done.
- As an agent, I see a lead's personal information (name, username, Facebook/Instagram
  ID, profile URL, profile photo, location, bio, published contact details) and business
  classification (buyer/seller/agent/broker/investor/unknown) alongside the AI analysis
  (buyer/seller/investor/confidence scores) — `leads` table, `features/leads/components/lead-detail-sheet.tsx`.
- As an agent, marking a lead "contacted" stamps the time automatically — I don't log
  time-to-first-touch myself, the action does it — `markContacted` in
  `application/leads/lead.actions.ts`.
- As an agent, I can assign a lead, change its status through a pipeline (`new` →
  `contacted` → `qualified` → `interested` → `negotiation` → `closed`, or `rejected`),
  leave notes, and bookmark it — all in `lead_states`, all surviving any reprocessing or
  rollup recompute of the underlying data.
- As an agent, when the same post is reposted or cross-posted, I see it collapsed under
  one canonical *appearance* with a repost count, inside that lead's list of sources —
  not as a separate inbox item and not confused with the (separate, person-level)
  identity merge above.
- As an admin, a new dataset from n8n/Apify shows up automatically without me
  configuring anything — `discoverDatasets`.
- As an admin, when an upstream actor changes its field names, I get a `schema_drift`
  health flag instead of the pipeline silently producing garbage — `computeHealth`.
- As an admin, I define who gets alerted about which kind of lead, on which channel, and
  can retune thresholds without asking for a deploy — `alert_rules` + the predicate
  language in `domain/alerting/predicate.ts`.
- As the sales team, we get one digest email per matching alert rule per sync run, not
  one email per lead — so the channel stays useful instead of getting muted.
- Sign-in requires no external email provider; the first person to sign in on a fresh
  instance becomes the admin, and admins add teammates with a one-time temporary
  password.
- As an agent, I can see and move every lead through its pipeline on a kanban board
  (`/pipeline`) — drag a card to another column, or use its status/assignee dropdowns —
  without leaving the board to open each lead individually.
- As an agent or admin, I can see intent, location, property-type, source-group and
  budget trends across the last 30 days (`/intelligence`), not just the current inbox
  filter's slice.
- As an admin, I can see every sync run across every dataset in one feed, drill into a
  single run's log, accept a drifted schema version, and approve an auto-generated
  mapping profile — all from `/admin/sync`.

## North-star metric

**Time-to-first-touch**: the gap between when a lead (person) was first identified
(`leads.createdAt`) and its `firstContactedAt`. Measured automatically (stamped by the
"mark contacted" action, not self-reported), aggregated as a median in
`getLeadStats()`, and surfaced on the inbox stats row. Rebased from a single post's
`postedAt` to the person's own `createdAt` when leads became person-centric — there's
no one "the post" anymore, and "how long from when we identified this person to first
contact" is the more correct read of the same metric. Every other feature in this
product — ranking, alerting, digest batching — is in service of shrinking this number.

## Non-goals / explicit scope decisions

- **Not a CRM.** No deal pipeline value, no invoicing, no scheduling — status tracking
  is deliberately minimal (a lead-state enum + notes + tags), not a full sales pipeline
  tool. Don't build CRM features here; integrate with a real CRM if that's ever needed.
- **Not multi-vendor at launch.** Only an Apify connector exists. The `SourceConnector`
  port exists specifically so this isn't a rewrite later, but there is currently exactly
  one implementation.
- **Engagement (likes/comments/shares) is explicitly not a ranking or scoring input for
  intent.** This was a deliberate product decision, not an oversight — see
  `architecture.md`.
- **No LLM classification or rollup yet.** The rules-based classifier and rules-based
  person rollup are intentionally the starting point; an LLM implementation of each is
  designed for (the `LeadClassifier` and `LeadIntelligence` ports, `classifierId`
  columns on both `lead_appearances` and `leads`) but not built. Don't assume one
  exists.
- **No fuzzy identity matching.** Merging two leads because their names/photos *look*
  similar is explicitly out of scope — identity resolution only merges on exact
  `facebookId`/`instagramId`/`profileUrl` match. A wrong merge is worse than a
  duplicate; see architecture.md.

## Roadmap / not built yet

In rough priority order as understood from the codebase and README:

1. **Buyer-side data sourcing (highest leverage, not a code change).** Current n8n
   feeds are almost entirely seller listings and job posts. Needs buyer-side Facebook
   groups, keyword searches, and mining commenters on listing posts. The person-centric
   lead model (identity merge, `recordKind`/`platform` on mapping profiles) is what
   makes that expansion produce clean, deduplicated leads once the n8n side ships — see
   [tech-debt.md](tech-debt.md).
2. **Visual mapping editor** — mapping profiles are still edited as JSON rows, not
   through a UI. (The pipeline kanban, intelligence dashboards, and cross-dataset sync
   activity feed that used to be listed here are built — `/pipeline`, `/intelligence`,
   `/admin/sync`.)
3. **LLM classifier and/or LLM rollup** behind the existing `LeadClassifier`/
   `LeadIntelligence` ports, shadow-mode validated against the rules-based versions
   before cutover. An engagement-only lead (liked a listing, no text anywhere) is the
   case a phrase lexicon structurally can't help with and an LLM given "this profile +
   these appearances" could.
4. **WhatsApp notifier** — `alertChannelEnum` already includes `whatsapp`, and the
   notifier registry pattern (`infrastructure/notifiers/registry.ts`) makes it a new
   adapter, but only `email` is implemented. This is called out in the README as "the
   channel that will actually be read on a Saturday" — i.e. the intended primary channel
   once built, not a nice-to-have.
5. **Embeddings / semantic search** — needs `pgvector`, not available on the local
   Postgres setup used during development.

## Acceptance criteria pattern

When implementing a new user-facing feature in this codebase, follow the shape already
established: a Zod-validated server action or filter schema, a `lead_events` row for
anything audit-worthy, cache tag invalidation scoped as narrowly as correct, and — if
it touches scoring/ranking/mapping — a domain-layer unit test alongside the change (see
[testing-strategy.md](testing-strategy.md)).
