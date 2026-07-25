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

- As an agent, I see an inbox of leads ranked by priority (intent + quality, recency
  weighted) by default, so the most contactable, most-real, most-recent buyer intent is
  always at the top — `triageFilters()` in `application/leads/filters.schema.ts`
  defaults to `intent=buyer, status=new, sort=priority`.
- As an agent, I can filter by intent, status, property type, location, source group,
  budget range, contact-availability, and any dynamically-discovered attribute from the
  raw data, with results paginated and sortable — `application/leads/lead-queries.ts`.
- As an agent, I see *why* a lead scored the way it did (specific phrases, budget
  evidence, location match) rather than a bare number — `scoreReasons` on every lead.
- As an agent, marking a lead "contacted" stamps the time automatically — I don't log
  time-to-first-touch myself, the action does it — `markContacted` in
  `application/leads/lead.actions.ts`.
- As an agent, I can assign a lead, change its status through a pipeline (`new` →
  `contacted` → `qualified` → `viewing_booked` → `converted`, or `lost`/`archived`/
  `spam`), leave notes, and bookmark it — all in `lead_states`, all surviving any
  reprocessing of the underlying data.
- As an agent, when the same post is reposted or cross-posted, I see it collapsed under
  one canonical lead with a duplicate count, not as separate inbox items.
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

## North-star metric

**Time-to-first-touch**: the gap between a lead's `postedAt` and its
`firstContactedAt`. Measured automatically (stamped by the "mark contacted" action, not
self-reported), aggregated as a median in `getLeadStats()`, and surfaced on the inbox
stats row. Every other feature in this product — ranking, alerting, digest batching — is
in service of shrinking this number.

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
- **No LLM classification yet.** The rules-based classifier is intentionally the
  starting point; an LLM classifier is designed for (the `LeadClassifier` port,
  `classifierId` column) but not built. Don't assume one exists.

## Roadmap / not built yet

In rough priority order as understood from the codebase and README:

1. **Buyer-side data sourcing (highest leverage, not a code change).** Current n8n
   feeds are almost entirely seller listings and job posts. Needs buyer-side Facebook
   groups, keyword searches, and mining commenters on listing posts. See
   [tech-debt.md](tech-debt.md).
2. **Pipeline kanban / intelligence dashboards / dataset comparison UI / visual mapping
   editor** — none of these exist; mapping profiles are currently edited as JSON rows,
   not through a UI editor.
3. **LLM classifier** behind the existing `LeadClassifier` port, shadow-mode validated
   against the rules classifier before cutover.
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
