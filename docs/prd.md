# Product Requirements

## Problem

Property buyers in Bali announce intent in public Facebook/Instagram groups ("looking to
buy a villa in Canggu, budget $300k") long before they ever reach an agent. Whoever
replies first tends to win the deal. The sales team needs those posts surfaced,
prioritized, and routed fast enough to be the first responder — not buried under the
much larger volume of seller listings and agency posts in the same groups.

## Users

Every user belongs to exactly one company (tenant) and has one role in a fixed,
flat hierarchy — `domain/auth/permissions.ts::Role` — each rank including
everything below it:

- **Member** — works the inbox: filters/searches leads, claims and contacts them,
  logs notes, tracks status through a pipeline. The base role every teammate gets
  by default.
- **Manager** — everything a member can do, plus: triggers manual sync/discovery,
  connects data sources (`/admin/collection`), manages datasets and mapping-profile
  review (`/admin/datasets`, `/admin/sync`).
- **Admin** — everything a manager can do, plus: manages team accounts and invites
  (`/admin/team`), alert rules and automation (`/admin/alerts`, `/admin/automation`),
  API keys (`/admin/api-keys`).
- **Owner** — everything an admin can do, plus: billing/plan changes
  (`/admin/billing`), granting the owner role to someone else, deleting the
  company. Exactly who a company's `/signup` creator becomes — see "Company
  category" below.

**Super Admin** (`isPlatformAdmin`) is a separate, orthogonal flag — not a fifth
rung on the ladder above, and not scoped to any one company. It unlocks
`/platform/*` (Tenants, Category Templates, Platform Analytics, Connector Health,
Platform Billing — a completely different, dark-shelled UI, not reachable from any
link inside the tenant app) and grants **read-only** visibility into cross-company
usage/health, plus exactly two logged, reversible support actions (extend a
tenant's trial, resend a stuck invite) — never a way to view or edit a tenant's
actual leads. Not grantable from any in-app UI by design — set only by a direct
database edit (`users.is_platform_admin`). See
[multi-tenant-apify-isolation-plan.md](multi-tenant-apify-isolation-plan.md) §3.

No public-facing or buyer-facing surface exists — this is entirely an internal
sales tool. (The one screen a non-member sees pre-login is `/invite/[token]` —
accepting a team invite — and `/signup`, which creates a brand-new, empty,
isolated company; see "Company category" below for what that flow now asks.)

## Company category (vertical)

Chosen once, as the first step of `/signup` (`features/auth/components/signup-form.tsx`),
before the company name/email/password fields — **Real Estate**, **Travel**,
**Courses**, or **Other**. Not editable from any in-app UI afterward (see
`companies.category`'s column comment) — changing it after leads exist would
silently change which classifier lexicon scores them without ever reprocessing
those leads, so it's treated as a one-time, deliberate decision, not a settings
toggle.

Drives, per company:

- **Which intent-phrase lexicon** scores a lead's text — `domain/scoring/lexicon-registry.ts`
  selects buyer/seller/agent/investor/broker phrase sets per category (Real
  Estate keeps the original, best-tuned lexicon unchanged; Travel and Courses
  get their own starter lexicons). `Other` falls back to Real Estate's rather
  than an empty one.
- **Field labels** in the lead inbox and detail sheet — "Property types" vs.
  "Trip interests" vs. "Course interests," etc. — `domain/verticals/catalog.ts`.
- **Which registered Apify actor templates get recommended first** at
  `/admin/collection` — templates can be tagged with a category
  (`actor_templates.category`); a company sees its own category's templates
  surfaced above the rest, never hidden.

What does **not** vary by category: the core pipeline (discover → sync →
classify → score → serve → alert), the `leadTypeEnum`
(buyer/seller/agent/broker/investor/unknown — maps reasonably across verticals
as-is), and the canonical spine columns (`propertyTypes`, `locations`, budget) —
these stay one shared shape, just relabeled per category, not duplicated.

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
- Sign-in requires no external email provider. `/signup` creates a brand-new company
  with its creator as owner (picking a category first — see above); every teammate
  after that joins via an emailed invite link (`application/auth/invite.actions.ts`),
  not a temporary password handed out up front.
- As a platform operator (Super Admin), I can see every tenant's usage, health, and
  billing at a glance, without ever seeing a tenant's actual leads — and when a
  tenant needs support (a trial extension, a resent invite), I do it through a
  logged action, not a direct database edit — `/platform/tenants`, `super_admin_actions`.
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
   `/admin/sync`. WhatsApp and Slack alert delivery are also built now, relaying through
   n8n — `infrastructure/notifiers/n8n.notifier.ts`, `n8n/workflows/notifications/08-*`
   — though the alert-rule builder UI still only offers `email`/`whatsapp` as selectable
   channels; `slack` is wired at the notifier level but deliberately not exposed there
   yet, see `features/alerting/components/alert-rule-manager.tsx`.)
3. **LLM classifier** — `infrastructure/ai/llm-classifier.ts` implements the
   `LeadClassifier` port behind `ANTHROPIC_API_KEY` + `LLM_SHADOW_CLASSIFY_ENABLED`
   (both optional, both off by default). `application/leads/shadow-classify.ts` fires
   it alongside the real rules classifier for every content post, purely for
   comparison logging — it never determines a persisted `intent`/score, and there is
   deliberately no cutover mechanism yet. Still needed: an actual evaluation of shadow
   logs against real lead volume before anyone considers flipping the primary path,
   and the equivalent `LeadIntelligence` (rollup) implementation — only the
   appearance-level classifier has a scaffold so far. An engagement-only lead (liked a
   listing, no text anywhere) is the case a phrase lexicon structurally can't help with
   and an LLM given "this profile + these appearances" could.
4. **Embeddings / semantic search** — needs `pgvector`, not available on the local
   Postgres setup used during development.

## Acceptance criteria pattern

When implementing a new user-facing feature in this codebase, follow the shape already
established: a Zod-validated server action or filter schema, a `lead_events` row for
anything audit-worthy, cache tag invalidation scoped as narrowly as correct, and — if
it touches scoring/ranking/mapping — a domain-layer unit test alongside the change (see
[testing-strategy.md](testing-strategy.md)).
