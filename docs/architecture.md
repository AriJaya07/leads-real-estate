# Architecture

AveronAi finds people who intend to buy property in Bali, ranks them by how real that
intent is, and gets a salesperson in front of them fast. n8n and Apify produce raw
datasets; the platform discovers, ingests, normalizes, scores and serves them without
ever hardcoding a dataset ID or requiring a deploy to add a source. A "lead" is a
**person**, deduplicated across every source they were collected from (Facebook Groups,
Posts, Comments, Post Likers, Instagram Post Likers, ...) — not a post.

For the product framing and roadmap see [prd.md](prd.md). For business terms see
[domain.md](domain.md).

## Data flow

```
DISCOVER → PROBE → INGEST → NORMALIZE → CLASSIFY → IDENTIFY → DEDUPE → ROLLUP → SERVE → ALERT
```

| Stage | What happens | Where |
| --- | --- | --- |
| Discover | Enumerate every dataset the source exposes — named *and* unnamed | [application/sync/discovery.ts](../application/sync/discovery.ts) |
| Probe | Cheap change check on `modifiedAt` + `itemCount` before any pull | [application/sync/sync-dataset.ts](../application/sync/sync-dataset.ts) |
| Ingest | Pull only from the watermark offset, committing per page | [application/sync/sync-dataset.ts](../application/sync/sync-dataset.ts) |
| Profile | Infer the payload shape, fingerprint it, detect drift | [domain/dataset/schema-inference.ts](../domain/dataset/schema-inference.ts) |
| Normalize | Project the payload through a declarative mapping profile | [domain/dataset/mapping.ts](../domain/dataset/mapping.ts) |
| Classify | Per-appearance intent + quality + reasons, via a swappable classifier port | [domain/scoring/rules-classifier.ts](../domain/scoring/rules-classifier.ts) |
| Identify | Match the appearance's author to an existing person, or create one | [domain/lead/identity.ts](../domain/lead/identity.ts), [application/leads/identity-resolution.ts](../application/leads/identity-resolution.ts) |
| Dedupe | Exact id, content hash, and trigram near-duplicate linking (appearance-level repost detection, independent of identity merge) | [application/leads/process-records.ts](../application/leads/process-records.ts) |
| Rollup | Recompute the person's buyer/seller/investor/confidence scores from every non-spam, non-duplicate appearance they have | [domain/scoring/lead-rollup.ts](../domain/scoring/lead-rollup.ts) |
| Serve | Filtered, faceted, priority-ranked queries over people | [application/leads/lead-queries.ts](../application/leads/lead-queries.ts) |
| Alert | DB-defined rules → deduped, throttled digests | [application/alerting/dispatch.ts](../application/alerting/dispatch.ts) |

Raw payloads are stored verbatim in `raw_records`. Changing a mapping profile or
swapping the classifier re-derives every appearance by replaying `raw_records` through
`processRawRecords` — no upstream re-fetch. Identity resolution itself only runs once
per appearance (at creation, not on replay — see domain.md), but the rollup it feeds is
just as regenerable: `recomputePersonRollup` can re-run for any person at any time.
That is what makes adding an LLM classifier — or a smarter rollup — later a backfill
job, not a migration.

## Layered dependency rule

```
domain/           Pure TypeScript. No framework, no I/O. Ports and business rules.
  dataset/        Schema inference, mapping engine, auto-proposal
  scoring/        Intent lexicon, extractors, rules classifier
  alerting/       Serialisable predicate language
  sync/           Connector ports, adaptive scheduling, health model
  lead/           Identity resolution (pure matching/merge rules), priority ranking

application/      Use cases and orchestration. Server actions, Zod boundaries.
infrastructure/   Adapters: Apify connector, Postgres/Drizzle, notifiers, auth, FX, logging
features/         Feature-scoped UI — one folder per application/ counterpart:
  leads/          ↔ application/leads
  datasets/       ↔ application/datasets (dataset registry, sync, discovery)
  team/           ↔ application/auth/team.actions.ts
  auth/           ↔ application/auth (login)
  pipeline/       ↔ application/leads (kanban view — same lead-status data, different UI)
  intelligence/   ↔ application/leads (aggregate/trend view — no application-layer counterpart of its own)
  shell/          App chrome: sidebar, topbar, theme toggle — not paired 1:1
hooks/            Shared client hooks (useUrlFilters, useServerAction) — see coding-standards.md
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
`APIFY_WEBHOOK_SECRET`, `AUTH_SECRET`, `RESEND_API_KEY`. There is no `APIFY_DATASET_ID`. Which
datasets sync, how often, who gets alerted, and what counts as a hot lead are rows in
`sources`, `datasets`, `mapping_profiles`, and `alert_rules`, edited from `/admin`. A
dataset that appears upstream is picked up by the next discovery pass with no human
action and no deploy — see `discoverDatasets` in
[application/sync/discovery.ts](../application/sync/discovery.ts).

## Key design decisions

**Polling was the primary change signal; there is no poller right now.** n8n pushes
items into named Apify datasets through the Dataset API rather than by running an actor,
so a "Run Succeeded" webhook never fires for that traffic
([app/api/webhooks/apify/route.ts](../app/api/webhooks/apify/route.ts)) — which is
exactly why polling, not the webhook, was the delivery guarantee. The `GET
/api/cron/sync` poller that provided it was removed in favour of triggering from n8n,
which isn't wired up yet, so today ingestion only happens on an actor-run webhook or a
manual sync from `/admin/datasets`. See [tech-debt.md](tech-debt.md)'s "no scheduled
trigger" entry — this is the single most consequential open gap in the system.

**Adaptive polling intervals, computed but not currently acted on.** Each dataset's
interval tightens after producing new items, backs off when quiet, and tightens again on
weekends (Bali time — that's when consumers browse property). `syncDataset` still
computes this and writes the `nextSyncDueAt` watermark, and `dueDatasets()` still reads
it, so whatever ends up driving the tick gets adaptive per-dataset behaviour for free by
calling `dueDatasets()` rather than syncing everything. See `nextIntervalSeconds` in
[domain/sync/scheduling.ts](../domain/sync/scheduling.ts).

**Curated mapping profiles beat auto-proposals.** `proposeMapping`
([domain/dataset/mapping-proposal.ts](../domain/dataset/mapping-proposal.ts)) handles a
dataset nobody has seen before; a hand-verified profile claims a dataset by
required-path match (`matchPaths`) and always wins over an auto-generated one. A
confident-but-wrong guess is worse than no mapping, because it looks like it worked.

**`leads`/`lead_appearances` are derived; `lead_states` is sacred.** Two levels of
derivation now, both freely regenerable: appearance-level fields (intent, score,
normalized fields on `lead_appearances`) can be rebuilt from `raw_records` by
re-running normalize + classify, and person-level fields (`leadType`, `buyerScore`,
...) can be rebuilt from a person's `lead_appearances` rows by re-running
`recomputePersonRollup`. Agent notes, assignment, status and `firstContactedAt` live in
`lead_states`, keyed by *person* id, and are written only by people — the pipeline
creates the row once (`onConflictDoNothing`) and never touches it again.

**A person exists once — identity resolution is deterministic, never fuzzy.**
`resolveIdentity` ([application/leads/identity-resolution.ts](../application/leads/identity-resolution.ts))
matches an appearance's author to an existing person by exact `facebookId`, then
`instagramId`, then normalized `profileUrl` — in that precedence order, never by
matching on name. A wrong merge (two different "John Wilson"s collapsed into one lead)
is worse than a duplicate lead, the same risk posture as "curated beats auto-proposal"
below. An existing match gets missing personal-info fields filled in but never
overwritten (`domain/lead/identity.ts::mergePersonalInfo`) — a later appearance with
stale cached profile data can't silently clobber a correct earlier value. Runs once per
appearance, at creation, not on every reprocess — an appearance's `leadId` is as stable
as `lead_states` once set.

**Lead type is a person-level rollup, deliberately a different taxonomy from lead
intent.** `LeadIntent` (`buyer|seller|agent|other`) is what one appearance's text looks
like, unchanged by the person/appearance split. `LeadType`
(`buyer|seller|agent|broker|investor|unknown`) is what a *person* looks like across
everything they've done — computed by
[domain/scoring/lead-rollup.ts](../domain/scoring/lead-rollup.ts) from every
appearance, with `investor`/`broker` fed by additive per-appearance signals
(`investorScore`/`brokerScore`) that never change an appearance's own `intent` pick.
Keeping these as two separate enums meant zero risk to the already-tested per-appearance
classification when the rollup was added — all new taxonomy work happens one layer up.

**Reposts are linked, not deleted — appearance-level, independent of person identity.**
Near-duplicate detection (`findCanonicalDuplicate` in
[application/leads/process-records.ts](../application/leads/process-records.ts)) sets
`canonicalAppearanceId` on the repost rather than dropping it — repost frequency is
itself an intent signal, and the UI collapses duplicates under the canonical
appearance. This is a different, narrower mechanism than person-level identity merge:
two appearances from the same `authorExternalId` already resolve to the same person via
`resolveIdentity` regardless of whether their text happens to match.

**Engagement is not intent — and engagement is not reach either, when it's the whole
record.** Likes measure post popularity, not intent to transact; `reach` is scored and
stored separately from `intentScore` and never enters it — see
[domain/scoring/rules-classifier.ts](../domain/scoring/rules-classifier.ts). The same
principle applies one level up for engagement-only leads: a `content_post`'s own
like/comment/share counts never become part of the *liker's* `reach`, since that's the
target post's popularity, not evidence about the person who liked it.

**Record kind is a content-shape axis, deliberately separate from source kind.**
`sources.kind` (apify/n8n/webform/manual) models *transport* — how data arrives.
`recordKind` (`content_post`/`engagement_like`/`engagement_comment`, on
`mapping_profiles` and carried onto `lead_appearances`) models what the record *is*. A
"Post Likers" scrape produces a person reacting to someone else's post, not a post of
their own — no body text, so no phrases to classify and no text to dedupe on.
Conflating the two axes would have broken the curated-mapping-profile-claims-a-dataset
mechanism that already correctly handles multiple content shapes from the same
connector kind; instead a mapping profile declares `recordKind` alongside its
`matchPaths`, and everything downstream (classifier, dedup) branches on it explicitly
rather than inferring it from an empty body. `platform` (`facebook`/`instagram`/`other`,
also on `mapping_profiles`) is a similar third independent axis, needed so identity
resolution knows whether a scraped author id fills `facebookId` or `instagramId`. See
[domain.md](domain.md) and [docs/lead-source-scaling-plan.md](lead-source-scaling-plan.md)
for the fuller design rationale — a curated `engagement_like`/`engagement_comment`
mapping profile for a real actor still needs to be added from `/admin` once its actual
payload shape is known, the same way any new curated profile is.

**Scoring is explainable.** Every appearance carries `scoreReasons` — the phrases and
signals that produced its score. Agents act on "82 because it says 'looking to buy' and
states a budget," not on a naked number. The person-level `aiExplanation` synthesizes
across a lead's appearances the same way, for the same reason.

**The phrase lexicon is swappable per company category; the scoring algorithm is
not.** `classifyWithRules` takes a `LexiconBundle` (buyer/seller/agent/investor/broker
phrase sets) as a parameter, defaulting to the original real-estate lexicon —
`domain/scoring/lexicon-registry.ts::getLexiconForCategory` selects the bundle
matching a company's `category` (real estate, travel, courses, or other; see
`docs/domain.md`). What does *not* vary by category: `sumWeights`'s
diminishing-returns math, the recruitment/spam irrelevance gate, and
`looksLikeListing()`'s bed/bath structured-listing heuristic — that last one is
real-estate-shaped by construction and simply never fires for other categories
(known limit, not a bug — see that function's own comment) rather than
misfiring. A vertical whose own "structured listing" concept isn't bed/bath-shaped
needs its own detector, not a phrase-list swap.

**Ranking is not scoring.** `priorityScore`
([domain/lead/ranking.ts](../domain/lead/ranking.ts)) folds a recency half-life (18h) and
an already-worked penalty on top of a person's `buyerScore`/`confidenceScore` — a person
with a 95 buyer score last active three days ago has had a dozen replies; one scored 80
and active ten minutes ago is still winnable. The same formula is duplicated in raw SQL
inside `priority-sql.ts`'s `prioritySortExpression` so it can drive `ORDER BY` and
paginate correctly — see [tech-debt.md](tech-debt.md).

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
excluded from the proxy matcher. There is no "first sign-in claims admin" bootstrap —
every account belongs to a company created via `/signup`
([application/auth/signup.actions.ts](../application/auth/signup.actions.ts)), whose
creator becomes that company's `owner`. See
[saas-platform-architecture.md](saas-platform-architecture.md) for the full
multi-tenant/role design.

**Roles are a fixed, enforced hierarchy: `owner > admin > manager > member`**
([domain/auth/permissions.ts](../domain/auth/permissions.ts)) — `roleAtLeast()` backs
every page guard and action gate (`requireAdmin`/`requireManager`,
`adminActionClient`/`managerActionClient`). Only an owner may grant or edit another
owner (`canAssignRole`); at least one owner per company is always enforced. New
teammates join via a real email invite
([application/auth/invite.actions.ts](../application/auth/invite.actions.ts)) — a
pending, expiring, single-use `invites` row, emailed a link (or shown on screen
without a mail provider configured) — not the admin-issued temporary password that
used to be the only path (that still exists for resetting an *existing* member's
credential, see `team.actions.ts::resetTeamMemberPassword`). Self-service "forgot
password" is a separate flow
([application/auth/password-reset.actions.ts](../application/auth/password-reset.actions.ts)).

**Sessions are revocable, not just verifiable.** A JWT is otherwise stateless and stays
valid until its own expiry (14 days) no matter what happens to the account afterward —
`users.sessionVersion` closes that gap. It's embedded in the JWT at sign-in and compared
against the live DB value on every `currentUser()` call
(`domain/auth/session-version.ts::isSessionRevoked`); a mismatch is treated as signed
out. It's bumped by `changePassword` (self-service — then immediately re-issues a fresh
session for the *same* device, so the person changing their own password isn't logged
out by their own action, while every other session for the account dies on its next
request), by an admin's `resetTeamMemberPassword`, and by `signOutEverywhere`.

**A temporary password blocks everything else until it's changed.** `users.mustChangePassword`
gates at two independent layers, per Next's own guidance that a client-side redirect
alone isn't a security boundary: `requireUser()` redirects to `/account`, and
`authActionClient` separately rejects every action except `changePassword` while the
flag is set. Both layers matter — closing only one leaves the other reachable directly.

**Every protected page calls `requireUser()`/`requireAdmin()` itself — the shared
`(app)` layout deliberately does not enforce beyond "is anyone signed in."** Next.js
layouts don't re-render on client-side navigation between sibling pages, so a check
placed only in the layout is unreliable past the first hard load; each page's own
Server Component render doesn't have that problem. This also avoids a redirect loop:
the layout wraps `/account` too, and `requireUser()`'s own mustChangePassword redirect
*targets* `/account` — enforcing it in the shared shell would loop forever on that exact
route. See the comment on `requireUser()` and on `AuthedShell` in
[app/(app)/layout.tsx](../app/(app)/layout.tsx) for the full reasoning. If you add a new
protected page, give it its own `requireUser()`/`requireManager()`/`requireAdmin()` call
(manager+ for "manage projects and data" pages like datasets/sync, admin+ for "manage
users and settings" pages like team) — don't assume the layout covers it.

**Super Admin is a flag, not a role, and not a bigger version of `owner`.**
`users.isPlatformAdmin` is orthogonal to the `owner > admin > manager > member`
hierarchy above — a company `owner` does not pass `requirePlatformAdmin()`, and
a platform admin's own tenant membership (they still belong to exactly one
company, like anyone) grants them no special access to *other* tenants' lead
data. It unlocks `/platform/*` — `application/platform/*.queries.ts` for the
reads (usage/health/billing metadata only, the same "never a row out of
`leads`" boundary the rest of the multi-tenant design enforces), and
`application/platform/tenant-actions.ts` for the only two writes allowed
(`platformActionClient`-gated, each logged to `super_admin_actions`). Not
grantable from any in-app UI — see `docs/multi-tenant-apify-isolation-plan.md`
§3 for the full design and why that's deliberate.

## Cache invalidation

`updateTag` is used where a user must see the effect of their own action immediately
(e.g. `setLeadStatus` in `lead.actions.ts`). `revalidateTag(tag, "max")` is used from
machine-triggered routes (currently just the Apify webhook) for stale-while-revalidate —
the dashboard keeps serving instantly while aggregates rebuild in the background. Tag
vocabulary is centralized in
[application/cache-tags.ts](../application/cache-tags.ts) and is per-dataset, so syncing
one dataset never invalidates another's cached aggregates.

## Search, filtering, and client-side data fetching

The lead inbox (`/leads`) and the topbar dataset switcher are the app's one genuinely
client-driven surface: search text, facet filters, sort, pagination, and dataset scope
all change far more often than a page navigation, and none of those changes should
force a full RSC round-trip. This is the one place the app layers a second cache
(TanStack React Query) on top of Next's Cache Components tag cache — deliberately, and
only here; every other page still reads directly from a `*-queries.ts` repository at
render time (see "The golden path" below).

**First paint is still server-rendered.** `app/(app)/leads/page.tsx` and
`app/(app)/layout.tsx` prefetch through the same `*-queries.ts` functions the rest of
the app uses (`queryLeads`, `getLeadStats`, `getLeadFacets`, `listDatasets`), via a
per-request `QueryClient` ([shared/query-client.ts](../shared/query-client.ts)), then
hand the result to the client with `dehydrate`/`<HydrationBoundary>`. There is no
client-side loading spinner on first load — the client component's `useQuery` call
resolves instantly from the hydrated cache with the same query key the server used.

**After first paint, filter/sort/page/dataset changes never re-hit the Server
Component.** `LeadInbox`, `LeadStatsRow`, and `AppTopbar` are self-sufficient client
components ([features/leads/queries.ts](../features/leads/queries.ts),
[features/datasets/queries.ts](../features/datasets/queries.ts)) that read filters from
the URL and fetch through thin auth-gated Route Handlers (`/api/leads`,
`/api/leads/facets`, `/api/leads/stats`, `/api/datasets`) instead. The URL itself is
kept in sync via shallow routing —
[hooks/use-url-filters.ts](../hooks/use-url-filters.ts) calls
`window.history.pushState` directly rather than `router.push`, so a filter change never
triggers Next's own RSC navigation (which would re-fetch on the server *and* the client
re-fetch through React Query — see Next's own guidance on SPAs with React Query in
`node_modules/next/dist/docs/`). `useSearchParams()` still reflects the change because
Next patches `history` globally.

**Query keys are typed `LeadFilters` objects, not raw query strings**
([application/leads/filters.schema.ts](../application/leads/filters.schema.ts)'s
`parseLeadFilters`/`serializeLeadFilters` is the one serialization boundary, covered by
its own test file) — chosen over stringly-typed keys specifically because the filtering
system had to be reliable and easy to maintain, not just quick to wire up.

**Some filters target `leads` directly; appearance-scoped ones become `EXISTS`
subqueries.** `leadType`, `propertyTypes`, `locations`, budget, `hasContact` are
rolled-up columns on `leads` and filter with a plain `WHERE`. `datasetId`, `groups`
(source group), `recordKind`, and `attr.*` (dynamic passthrough attributes) are
appearance-level concepts — a person isn't scoped to one dataset or group, they can
have appearances across many — so `application/leads/lead-queries.ts::buildConditions`
filters those with `EXISTS (SELECT 1 FROM lead_appearances WHERE lead_id = leads.id
AND ...)` instead. The list/card views also need *some* text/date to show per person
even though a lead has no single post anymore: `queryLeads` left-joins a `DISTINCT ON
(lead_id)` subquery (`primaryAppearanceSubquery`) picking each person's
highest-scoring, most recent non-spam appearance as `primaryAppearance` — the full
history is a separate query (`getLeadAppearances`, `/api/leads/[leadId]/appearances`),
fetched only once the detail sheet for that lead is open.

**Facets and stats are keyed on `datasetId` alone, not the full filter set.** This is
the concrete optimization over the old RSC version, which re-ran every query (list,
facets, stats) on every filter change: changing sort, page, or search text now only
refetches the list. `useLeadsQuery` uses `placeholderData: keepPreviousData` so
paginating never flashes to a blank/loading state — the previous page stays on screen,
dimmed, until the next one resolves.

**Query-key functions live in directive-free modules**
([features/leads/query-keys.ts](../features/leads/query-keys.ts),
[features/datasets/query-keys.ts](../features/datasets/query-keys.ts)), separate from
the `"use client"` hook files that also export them for convenience. A Server Component
can't call a function exported from a `"use client"` module — it becomes a client
reference — which is why the prefetching pages import keys from the plain module, not
from `features/leads/queries.ts` directly.

**Every mutation that affects a leads/datasets view invalidates both caches.** A server
action already calls `updateTag`/`revalidateTag` for the RSC tag cache; that has no way
to reach the separate client-side React Query cache. `hooks/use-server-action.ts`'s
`run()` accepts an `invalidateKeys` option that calls `queryClient.invalidateQueries()`
alongside its existing `router.refresh()` — see `dataset-table.tsx`,
`discovery-button.tsx`. Mutations outside that hook (`lead-detail-sheet.tsx`,
`lead-inbox.tsx`'s contact actions) call `queryClient.invalidateQueries({ queryKey:
["leads"] })` directly; a partial key match invalidates the list, facets, and stats
queries in one call since they all share the `"leads"` prefix. Skipping this half is
what "the switcher still shows a dataset as paused after reactivating it" bugs are made
of.

## Performance

**Server-side caching was tag vocabulary without a cache, until now.**
`application/cache-tags.ts` and every `updateTag`/`revalidateTag` call already existed
(prior round), but nothing had ever opted into Cache Components' `"use cache"` — so
every `/leads` load and every `/leads`-adjacent read route hit Postgres fresh, tags or
not. Several read functions are now actually cached, each `"use cache"` + `cacheLife`
+ `cacheTag`, keyed on their own (small, bounded) arguments:

| Function | Tag(s) | Why this tag |
| --- | --- | --- |
| `listDatasets` (`application/datasets/dataset-queries.ts`) | `datasetsRegistryTag()`, `leadsTag()` | Registry tag for admin dataset actions (read-your-own-writes via `updateTag`); `leadsTag()` too because `leadCount`/`buyerCount` are computed live as distinct-person counts over `lead_appearances` (a person seen 5 times in a dataset counts once) and only a webhook-triggered sync's background `revalidateTag(leadsTag(), "max")` touches those numbers between admin actions |
| `getSyncOverview`, `getRecentSyncRuns` (`application/datasets/dataset-queries.ts`) | `datasetsRegistryTag()`, `leadsTag()` | Same tags as `listDatasets` — both back `/admin/datasets` and `/admin/sync`'s prop-less, dynamic-API-free Suspense children, which need `"use cache"` for a different reason than freshness preference: see the note below on why that combination risks never re-executing at all |
| `getLeadStats` (`application/leads/lead-queries.ts`) | `leadsTag()` | Same tag every lead mutation (`lead.actions.ts`) already invalidates |
| `getLeadFacets` / `getDynamicAttributeFacets` (`application/leads/facets.ts`) | `leadsTag()` | Facet counts derive from the same lead rows the stats row does — same invalidation lifecycle, see tech-debt.md on why the narrower `facetsTag()` isn't used yet |
| `getLeadTrend`, `getBudgetStats` (`application/leads/lead-queries.ts`) | `leadsTag()` | Back `/intelligence`'s trend chart and budget stat tiles — same lifecycle as `getLeadStats` |

**A Suspense child with no dynamic-API access and no dynamic props is eligible to be
frozen into the static build shell — this bit `/admin/sync` for real.** Every
prefetched read elsewhere in the app sits downstream of an awaited `searchParams` (or
a dynamic route `params`), which is what makes the surrounding component — and
everything it calls — genuinely per-request. `/admin/sync/page.tsx`'s `Overview`/
`RecentActivity` take no props and call neither `searchParams` nor `cookies()`, so
under Cache Components they qualified for the static shell and, without `"use cache"`,
would have been baked in at build time and never re-run — a sync triggered afterward
would never show up. `"use cache"` plus a tag the relevant mutations already invalidate
(same table above) is the fix, and it's the same fix `listDatasets` already needed for
`/admin/datasets`'s identically-shaped `Overview`/`Registry`. **Rule of thumb**: any
Suspense-wrapped read component that doesn't itself touch a dynamic API needs an
explicit `"use cache"` on what it calls — don't rely on "it's inside a dynamic page" to
make it fresh.

All of the above use the `"minutes"` profile (`stale` 5m client / `revalidate` 1m server /
`expire` 1h) — short enough that a background change surfaces within a minute even
if nothing explicitly invalidates it, long enough that repeated navigations and
`router.refresh()` calls (every mutation triggers one) hit the cache instead of
Postgres. `updateTag()` bypasses all of this for the actor's own change regardless —
cache duration only governs *other* users/tabs.

**Deliberately not cached: `queryLeads`.** Its argument is the full `LeadFilters`
object — free-text search, arbitrary filter/sort/page combinations — so the cache key
space is effectively unbounded and a cache would rarely hit. The primary list is also
the surface where staleness matters most (agents want live top-of-funnel leads). Live
DB read stays the right choice here.

**Rendering: `LeadInbox`'s rows are memoized.** `LeadCard` (mobile/cards view) and
`LeadRow` (desktop table, extracted from an inline `.map()` for this) are wrapped in
`React.memo`, and the `contact` handler passed down to both is `useCallback`'d. Without
this, every row's render function re-ran whenever `LeadInbox` re-rendered for a reason
that had nothing to do with that row's data — `isFetching`/`isPlaceholderData` toggling
is applied to a *wrapper* `<div>`, not threaded into row props, so the resulting JSX per
row was usually identical; memoizing turns that into a bailout instead of a full
re-render. `DatasetTable`/`TeamTable` have a smaller version of the same shape but were
left un-memoized — see tech-debt.md for why.

**Code splitting: `LeadDetailSheet` is `next/dynamic`, not a static import.** It renders
`null` until a lead is selected but was previously bundled into `/leads`'s initial chunk
regardless. `dynamic(() => import(...), { ssr: false })` — `ssr: false` because it's
always closed on first paint, so there's no server-rendered markup to lose by skipping
SSR for it. Covered by `e2e/lead-triage.spec.ts`'s "clicking a row opens the
lazy-loaded lead detail sheet", specifically so a chunk-loading regression here would
fail a test rather than only show up as a silent bundle-size regression.

**Bundle size: four unused shadcn primitives and their dependencies were removed**
(`components/ui/carousel.tsx`, `command.tsx`, `calendar.tsx`, `form.tsx`, and
`embla-carousel-react`, `cmdk`, `react-day-picker`, `react-hook-form`,
`@hookform/resolvers`, `@radix-ui/react-label`, `@radix-ui/react-slot`). Nothing
imported them — this app's forms are plain controlled inputs + server actions
(`hooks/useServerAction`), not `react-hook-form`, and its primitives are `@base-ui/react`
(the `base-nova` shadcn style), not Radix. They cost nothing in any shipped bundle
already (route-based code splitting only includes what's actually imported), but they
were a landmine: importing `@/components/ui/form` would have silently pulled
`react-hook-form` into a real page's bundle the moment anyone reached for the familiar
shadcn form pattern instead of the pattern this codebase actually uses.

**React Query `staleTime` is differentiated per query, not one blanket value.** The
`QueryClient` default (`shared/query-client.ts`) stays 30s for the leads list; facets,
stats, and datasets set `staleTime: 60_000` explicitly at the `useQuery` call site,
matched to those same reads' server-side `cacheLife("minutes")` 1-minute revalidate
window — see the caching table above. No point refetching the client cache faster than
the server data underneath it actually changes.

**Navigation, images, Core Web Vitals: already correct, audited this round with no
code change needed.** Sidebar/nav links (`features/shell/components/nav-content.tsx`)
are plain `next/link` with default (automatic, viewport-triggered) prefetch — no
`prefetch={false}` anywhere suppressing it. Every dynamic app route already renders as
a Partial Prerender (`◐` in `next build`'s route table) via `cacheComponents`, so every
page already gets an instant static-shell paint on navigation without needing
per-route `loading.tsx` files. The images in the app (`lead-detail-sheet.tsx`'s avatar
and per-appearance photos) deliberately stay plain `<img>`, not `next/image` — see the
comments there: these are signed, expiring CDN URLs, and the optimizer would cache a
URL that later 403s. `next.config.ts`'s `images.formats`/`remotePatterns` already cover
every image host actually in use.

## Data-quality and observability additions

Two small subsystems sit alongside the core pipeline without changing its shape:

**Mapping-quality guardrail.** An auto-approved mapping profile (confidence ≥ 0.8, zero
human review by design) gets its first batch checked by
`domain/dataset/mapping-quality.ts::assessMappingQuality`. If it looks suspect (mostly
spam-flagged or empty-body), `syncDataset` revokes the profile's approval so the next
sync treats it as awaiting review instead of silently continuing to normalize through a
wrong mapping. See [tech-debt.md](tech-debt.md) for what this does and doesn't catch.

**FX refresh.** `application/fx/refresh-fx-rates.ts` refreshes every currency already
tracked in `fx_rates` from `infrastructure/fx/fx-rate.provider.ts` (ECB rates via
frankfurter.dev). A failed refresh leaves existing rows untouched — same "degrade
gracefully" rule as every other adapter here. Nothing calls it on a schedule today — see
tech-debt.md's "no scheduled trigger" entry.

**Structured logging.** `infrastructure/observability/logger.ts` gives every log line
outside `sync_events` a consistent JSON shape (`{ level, scope, message, ...fields,
time }`), with an `ErrorReporter` seam for wiring a managed service like Sentry later
without touching call sites. Nothing is plugged into that seam today — it's a shape, not
a vendor integration.

## Not built yet

See [prd.md](prd.md) for the full roadmap. The highest-impact outstanding item is not
code: the datasets currently collected are almost entirely seller listings and job
posts. Finding *buyers* needs a change on the n8n side (buyer-side groups, keyword
searches, mining commenters on listing posts), not a code change here — though the
person-centric lead model (this doc) is exactly what makes mining likers/commenters
across many sources produce one clean lead per person instead of a flood of duplicates
once that n8n-side work happens. No curated mapping profile exists yet for a *real*
Post Likers/IG-likers actor — `recordKind`/`platform` and the scoring/dedup/identity
branches they drive are built and tested, but writing `matchPaths` against a guessed
payload shape would be exactly the "confident-but-wrong mapping" this codebase avoids
elsewhere; that's an `/admin` edit once such an actor is actually wired up.
