# Architecture

DreamRue finds people who intend to buy property in Bali, ranks them by how real that
intent is, and gets a salesperson in front of them fast. n8n and Apify produce raw
datasets; the platform discovers, ingests, normalizes, scores and serves them without
ever hardcoding a dataset ID or requiring a deploy to add a source.

For the product framing and roadmap see [prd.md](prd.md). For business terms see
[domain.md](domain.md).

## Data flow

```
DISCOVER → PROBE → INGEST → NORMALIZE → DEDUPE → SCORE → SERVE → ALERT
```

| Stage | What happens | Where |
| --- | --- | --- |
| Discover | Enumerate every dataset the source exposes — named *and* unnamed | [application/sync/discovery.ts](../application/sync/discovery.ts) |
| Probe | Cheap change check on `modifiedAt` + `itemCount` before any pull | [application/sync/sync-dataset.ts](../application/sync/sync-dataset.ts) |
| Ingest | Pull only from the watermark offset, committing per page | [application/sync/sync-dataset.ts](../application/sync/sync-dataset.ts) |
| Profile | Infer the payload shape, fingerprint it, detect drift | [domain/dataset/schema-inference.ts](../domain/dataset/schema-inference.ts) |
| Normalize | Project the payload through a declarative mapping profile | [domain/dataset/mapping.ts](../domain/dataset/mapping.ts) |
| Dedupe | Exact id, content hash, and trigram near-duplicate linking | [application/leads/process-records.ts](../application/leads/process-records.ts) |
| Score | Intent + quality + reasons, via a swappable classifier port | [domain/scoring/rules-classifier.ts](../domain/scoring/rules-classifier.ts) |
| Serve | Filtered, faceted, priority-ranked queries | [application/leads/lead-queries.ts](../application/leads/lead-queries.ts) |
| Alert | DB-defined rules → deduped, throttled digests | [application/alerting/dispatch.ts](../application/alerting/dispatch.ts) |

Raw payloads are stored verbatim in `raw_records`. Changing a mapping profile or
swapping the classifier re-derives every lead by replaying `raw_records` through
`processRawRecords` — no upstream re-fetch. That is what makes adding an LLM classifier
later a backfill job, not a migration.

## Layered dependency rule

```
domain/           Pure TypeScript. No framework, no I/O. Ports and business rules.
  dataset/        Schema inference, mapping engine, auto-proposal
  scoring/        Intent lexicon, extractors, rules classifier
  alerting/       Serialisable predicate language
  sync/           Connector ports, adaptive scheduling, health model
  lead/           Priority ranking

application/      Use cases and orchestration. Server actions, Zod boundaries.
infrastructure/   Adapters: Apify connector, Postgres/Drizzle, notifiers, auth
features/         Feature-scoped UI (leads, admin, shell, auth)
components/       ui/ primitives · common/ composed · brand/ custom SVG
app/              Routes. (app) is authenticated; (auth) is not.
shared/           Config and constants
```

The dependency rule runs one way: `domain` imports nothing outside itself.
`application` depends on `domain` through ports (`domain/sync/ports.ts`,
`domain/scoring/types.ts`). `infrastructure` implements those ports
(`infrastructure/apify/apify.connector.ts` implements `SourceConnector`;
`infrastructure/notifiers/email.notifier.ts` implements `Notifier`). `features`/`app`
depend on `application`, never directly on `infrastructure`.

Adding a new upstream source (a portal feed, an inbound WhatsApp webhook, a web form) is
a new file in `infrastructure/` registered in
[infrastructure/connectors/registry.ts](../infrastructure/connectors/registry.ts) — the
sync engine never learns a vendor's name. Same pattern for notification channels via
[infrastructure/notifiers/registry.ts](../infrastructure/notifiers/registry.ts).

## Why config lives in the database, not the environment

`.env` holds secrets and deployment identity only: `DATABASE_URL`, `APIFY_API_TOKEN`,
`CRON_SECRET`, `AUTH_SECRET`, `RESEND_API_KEY`. There is no `APIFY_DATASET_ID`. Which
datasets sync, how often, who gets alerted, and what counts as a hot lead are rows in
`sources`, `datasets`, `mapping_profiles`, and `alert_rules`, edited from `/admin`. A
dataset that appears upstream is picked up by the next discovery pass with no human
action and no deploy — see `discoverDatasets` in
[application/sync/discovery.ts](../application/sync/discovery.ts).

## Key design decisions

**Polling is the primary change signal; webhooks only accelerate it.** n8n pushes items
into named Apify datasets through the Dataset API rather than by running an actor, so a
"Run Succeeded" webhook never fires for that traffic
([app/api/webhooks/apify/route.ts](../app/api/webhooks/apify/route.ts)). The poller in
`/api/cron/sync` is what guarantees delivery. A missed webhook costs one poll cycle, not
the data.

**Adaptive polling, not a fixed cron.** `vercel.json` ticks discovery every 15 minutes
and sync every 5, but each dataset's actual interval tightens after producing new items,
backs off when quiet, and tightens again on weekends (Bali time — that's when consumers
browse property). See `nextIntervalSeconds` in
[domain/sync/scheduling.ts](../domain/sync/scheduling.ts).

**Curated mapping profiles beat auto-proposals.** `proposeMapping`
([domain/dataset/mapping-proposal.ts](../domain/dataset/mapping-proposal.ts)) handles a
dataset nobody has seen before; a hand-verified profile claims a dataset by
required-path match (`matchPaths`) and always wins over an auto-generated one. A
confident-but-wrong guess is worse than no mapping, because it looks like it worked.

**`leads` is derived; `lead_states` is sacred.** Everything in the `leads` table
(intent, score, normalized fields) can be rebuilt from `raw_records` by re-running
normalize + classify. Agent notes, assignment, status and `firstContactedAt` live in
`lead_states` and are written only by people — the pipeline creates the row once
(`onConflictDoNothing`) and never touches it again.

**Reposts are linked, not deleted.** Near-duplicate detection
(`findCanonicalDuplicate` in
[application/leads/process-records.ts](../application/leads/process-records.ts)) sets
`canonicalLeadId` on the repost rather than dropping it — repost frequency is itself an
intent signal, and the UI collapses duplicates under the canonical lead.

**Engagement is not intent.** Likes measure post popularity, not intent to transact.
`reach` is scored and stored separately from `intentScore` and never enters it — see
[domain/scoring/rules-classifier.ts](../domain/scoring/rules-classifier.ts).

**Scoring is explainable.** Every lead carries `scoreReasons` — the phrases and signals
that produced the score. Agents act on "82 because it says 'looking to buy' and states a
budget," not on a naked number.

**Ranking is not scoring.** `priorityScore`
([domain/lead/ranking.ts](../domain/lead/ranking.ts)) folds a recency half-life (18h) and
an already-worked penalty on top of intent/quality — a 95-score post from three days ago
has had a dozen replies; an 80-score post from ten minutes ago is still winnable. The
same formula is duplicated in raw SQL inside `lead-queries.ts`'s `orderBy` so it can
drive `ORDER BY` and paginate correctly — see [tech-debt.md](tech-debt.md).

**Time-to-first-touch is the north-star metric.** `markContacted` in
[application/leads/lead.actions.ts](../application/leads/lead.actions.ts) stamps
`firstContactedAt` from the contact action itself (only the first touch counts), so
nobody has to log anything. `getLeadStats` computes the median in SQL.

## Auth model

Session cookie is a signed JWT (`jose`, HS256) checked two ways:
[proxy.ts](../proxy.ts) does a cheap cookie-presence redirect (optimistic only, not a
security boundary), and `currentUser()` in
[application/auth/current-user.ts](../application/auth/current-user.ts) re-verifies
against the database on every server action and page — that's the actual boundary.
Cron/webhook routes carry their own bearer secret instead
([application/http/verify-secret.ts](../application/http/verify-secret.ts)) and are
excluded from the proxy matcher. No email provider is involved in sign-in; the first
account to sign in on a fresh instance claims admin.

## Cache invalidation

`updateTag` is used where a user must see the effect of their own action immediately
(e.g. `setLeadStatus` in `lead.actions.ts`). `revalidateTag(tag, "max")` is used from the
cron/webhook routes for stale-while-revalidate — the dashboard keeps serving instantly
while aggregates rebuild in the background. Tag vocabulary is centralized in
[application/cache-tags.ts](../application/cache-tags.ts) and is per-dataset, so syncing
one dataset never invalidates another's cached aggregates.

## Not built yet

See [prd.md](prd.md) for the full roadmap. The highest-impact outstanding item is not
code: the datasets currently collected are almost entirely seller listings and job
posts. Finding *buyers* needs a change on the n8n side (buyer-side groups, keyword
searches, mining commenters on listing posts), not a code change here.
