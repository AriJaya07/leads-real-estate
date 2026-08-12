# AveronAi Lead Intelligence Platform

Finds people who intend to buy property in Bali, ranks them by how real that intent is,
and gets a salesperson in front of them fast enough to be the first responder. Real
estate is the flagship, best-tuned vertical — the platform is multi-tenant and
multi-category: a company picks Real Estate, Travel, Courses, or Other at signup, which
selects its own intent-classifier lexicon and field labels without any code change (see
"Company category" in [docs/prd.md](docs/prd.md)).

Datasets produced by n8n and Apify are **discovered, versioned, normalized and synced
automatically**. There is no dataset ID in the environment, and adding a source never
requires a deploy.

The architecture is in [docs/architecture.md](docs/architecture.md), business terms in
[docs/domain.md](docs/domain.md), and the product framing/roadmap in [docs/prd.md](docs/prd.md).
Platform-operator tooling (cross-tenant usage/health/billing, never a tenant's actual
leads) is a separate `/platform/*` portal — see
[docs/multi-tenant-apify-isolation-plan.md](docs/multi-tenant-apify-isolation-plan.md) §3.

---

## Quick start

```bash
# 1. Postgres (any Postgres 14+; Neon and Supabase both work)
createdb averonai_dev

# 2. Configure
nano .env                 # fill in DATABASE_URL, APIFY_API_TOKEN, and the secrets — see docs/environment.md

# 3. Schema + baseline configuration
npm run db:migrate
npm run db:seed

# 4. Run
npm run dev
```

Then open `/login`. The instance has no accounts yet, so the email and password you enter
there create the first **admin** account. No email provider is involved in signing in.

Add teammates in **Admin → Team**: you enter their email, the app generates a temporary
password and shows it once, and you pass it to them directly. They are prompted to change
it on first sign-in. Passwords are hashed with scrypt (N=16384, per-user salt) and
compared in constant time.

Discovery and sync are triggered externally (n8n) rather than on a built-in schedule —
there is no cron job in this app. To pull data in immediately from **Admin → Datasets**,
use the "Discover datasets" button and each dataset's sync action; both call the same
`discoverAllSources()`/`syncDataset()` functions an external scheduler would.

---

## How the data flows

```
DISCOVER → PROBE → INGEST → NORMALIZE → DEDUPE → SCORE → SERVE → ALERT
```

| Stage | What happens | Where |
| --- | --- | --- |
| **Discover** | Enumerate every dataset the source exposes — named *and* unnamed | `application/sync/discovery.ts` |
| **Probe** | Cheap change check on `modifiedAt` + `itemCount` before any pull | `application/sync/sync-dataset.ts` |
| **Ingest** | Pull only from the watermark offset, committing per page | `application/sync/sync-dataset.ts` |
| **Profile** | Infer the payload shape, fingerprint it, detect drift | `domain/dataset/schema-inference.ts` |
| **Normalize** | Project the payload through a declarative mapping profile | `domain/dataset/mapping.ts` |
| **Dedupe** | Exact id, content hash, and trigram near-duplicate linking | `application/leads/process-records.ts` |
| **Score** | Intent + quality + reasons, via a swappable classifier port | `domain/scoring/rules-classifier.ts` |
| **Serve** | Filtered, faceted, priority-ranked queries | `application/leads/lead-queries.ts` |
| **Alert** | DB-defined rules → deduped, throttled digests | `application/alerting/dispatch.ts` |

Raw payloads are stored verbatim in `raw_records`. Changing a mapping profile or
swapping the classifier re-derives every lead **without re-hitting the upstream API** —
which is what makes adding an LLM classifier later a backfill job rather than a
migration.

---

## Key design decisions

**Polling is the primary change signal; webhooks only accelerate it.** n8n pushes items
into named Apify datasets through the Dataset API rather than by running an actor, so a
"Run Succeeded" webhook never fires for that traffic. A missed webhook costs one poll
cycle, not the data.

**Curated mapping profiles beat auto-proposals.** Auto-proposal handles a dataset nobody
has seen before; a hand-verified profile claims a dataset by required-path match and
always wins. A confident-but-wrong guess is worse than no mapping, because it looks like
it worked.

**`leads` is derived; `lead_states` is sacred.** Everything in `leads` can be rebuilt from
raw records. Agent notes, assignment, status and first-contact timestamps live in
`lead_states` and survive every reprocess.

**Engagement is not intent.** Likes measure post popularity, not intent to transact.
Mixing them lets a popular listing outrank a real buyer, so `reach` is reported
separately and never enters the intent score.

**Scoring is explainable.** Every lead carries the reasons behind its score. Agents
ignore a naked number; they act on "82 because it says 'looking to buy' and states a
budget."

**Time-to-first-touch is the north-star metric.** It is stamped by the contact action
itself, so nobody has to log anything.

---

## Configuration

Sign-in is email + password; nothing about authentication depends on a mail service.
`RESEND_API_KEY` powers invite/password-reset emails and lead alerts (the `email`
notifier channel); the app runs fine without it, each degrading to a logged warning
instead of a hard failure. The `whatsapp`/`slack` alert channels relay through n8n
instead (`infrastructure/notifiers/n8n.notifier.ts`) — see
[docs/environment.md](docs/environment.md).

Environment holds **secrets and deployment identity only**. Everything operational —
which datasets sync, how often, who gets alerted, what counts as a hot lead — is database
state managed from `/admin`. See [docs/environment.md](docs/environment.md).

Scheduling runs through n8n: seven `POST /api/trigger/*` routes
(`discover`/`sync`/`fx`/`retention`/`weekly-report`/`auto-assign`/`reminders`), each
guarded by `N8N_TRIGGER_SECRET`, are what n8n calls on a schedule (suggested: discovery
every 15 minutes, sync every 5 — see [docs/environment.md](docs/environment.md)'s
"Scheduled jobs" section for the full table and [docs/api-patterns.md](docs/api-patterns.md)
for the request pattern, or [n8n/README.md](n8n/README.md) for the ready-to-import
workflow files). Per-dataset intervals adapt on top of that — faster after new items,
backing off when quiet, and tightened at weekends (Bali time), which is when consumers
browse property.

---

## Project layout

```
domain/           Pure TypeScript. No framework, no I/O. Ports and business rules.
  dataset/        Schema inference, mapping engine, auto-proposal
  scoring/        Intent lexicon (+ per-category lexicons), extractors, rules classifier
  alerting/       Serialisable predicate language
  sync/           Connector ports, adaptive scheduling, health model
  lead/           Priority ranking
  verticals/      Company category catalog (real estate/travel/courses/other)

application/      Use cases and orchestration. Server actions, Zod boundaries.
  platform/       Super Admin portal queries/actions — cross-tenant, read-only + 2 logged writes
infrastructure/   Adapters: Apify connector, Postgres/Drizzle, notifiers, auth
features/         Feature-scoped UI (leads, admin, shell, auth, platform)
components/       ui/ primitives · common/ composed · brand/ custom SVG · platform/ Super Admin shell
app/              Routes. (app) is authenticated; (auth) is not; (platform) is Super Admin only.
shared/           Config and constants
```

The dependency rule runs one way: domain imports nothing, application depends on domain
through ports, infrastructure implements them, presentation depends on application.

---

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm test             # unit suite — domain, application, and infrastructure logic
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:generate  # create a migration from schema changes
npm run db:migrate   # apply migrations (also creates pg_trgm)
npm run db:seed      # source, mapping profile, alert rules, aliases, FX
npm run db:studio    # drizzle studio
```

---

## Not built yet

See [docs/prd.md](docs/prd.md)'s "Roadmap / not built yet" for the full list, and
[docs/tech-debt.md](docs/tech-debt.md) for everything already shipped with a known gap.
Outstanding:

- Visual mapping editor — mapping profiles are still edited as JSON rows
- LLM classifier: adapter + shadow-mode comparison logging scaffolded
  (`infrastructure/ai/llm-classifier.ts`, behind `ANTHROPIC_API_KEY` +
  `LLM_SHADOW_CLASSIFY_ENABLED`), but nothing evaluates the shadow logs yet and there's
  no cutover mechanism by design — the rules classifier is still the only thing that
  determines a persisted score. The `LeadIntelligence` (rollup) port has no LLM
  implementation at all yet, only the classifier does.
- Embeddings / semantic search (needs `pgvector`, unavailable on the local Postgres)

**The highest-impact outstanding item is not code.** The datasets currently being
collected are almost entirely seller listings and job posts. Finding *buyers* needs a
change on the n8n side — buyer-side groups, keyword searches, and mining the commenters
on listing posts. See [docs/prd.md](docs/prd.md) and [docs/tech-debt.md](docs/tech-debt.md).
