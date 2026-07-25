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
infrastructure/   Adapters: Apify connector, Postgres/Drizzle, notifiers, auth, FX, logging
features/         Feature-scoped UI — one folder per application/ counterpart:
  leads/          ↔ application/leads
  datasets/       ↔ application/datasets (dataset registry, sync, discovery)
  team/           ↔ application/auth/team.actions.ts
  auth/           ↔ application/auth (login)
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
protected page, give it its own `requireUser()`/`requireAdmin()` call — don't assume the
layout covers it.

## Cache invalidation

`updateTag` is used where a user must see the effect of their own action immediately
(e.g. `setLeadStatus` in `lead.actions.ts`). `revalidateTag(tag, "max")` is used from the
cron/webhook routes for stale-while-revalidate — the dashboard keeps serving instantly
while aggregates rebuild in the background. Tag vocabulary is centralized in
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
not. Four read functions are now actually cached, each `"use cache"` + `cacheLife`
+ `cacheTag`, keyed on their own (small, bounded) arguments:

| Function | Tag(s) | Why this tag |
| --- | --- | --- |
| `listDatasets` (`application/datasets/dataset-queries.ts`) | `datasetsRegistryTag()`, `leadsTag()` | Registry tag for admin dataset actions (read-your-own-writes via `updateTag`); `leadsTag()` too because `leadCount`/`buyerCount` are computed live from `leads` and only cron sync's background `revalidateTag(leadsTag(), "max")` touches those numbers between admin actions |
| `getLeadStats` (`application/leads/lead-queries.ts`) | `leadsTag()` | Same tag every lead mutation (`lead.actions.ts`) already invalidates |
| `getLeadFacets` / `getDynamicAttributeFacets` (`application/leads/facets.ts`) | `leadsTag()` | Facet counts derive from the same lead rows the stats row does — same invalidation lifecycle, see tech-debt.md on why the narrower `facetsTag()` isn't used yet |

All four use the `"minutes"` profile (`stale` 5m client / `revalidate` 1m server /
`expire` 1h) — short enough that a background cron change surfaces within a minute even
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
per-route `loading.tsx` files. The one image in the app (`lead-detail-sheet.tsx`'s post
photos) deliberately stays a plain `<img>`, not `next/image` — see the comment there:
these are signed, expiring CDN URLs, and the optimizer would cache a URL that later
403s. `next.config.ts`'s `images.formats`/`remotePatterns` already cover every image
host actually in use.

## Data-quality and observability additions

Two small subsystems sit alongside the core pipeline without changing its shape:

**Mapping-quality guardrail.** An auto-approved mapping profile (confidence ≥ 0.8, zero
human review by design) gets its first batch checked by
`domain/dataset/mapping-quality.ts::assessMappingQuality`. If it looks suspect (mostly
spam-flagged or empty-body), `syncDataset` revokes the profile's approval so the next
sync treats it as awaiting review instead of silently continuing to normalize through a
wrong mapping. See [tech-debt.md](tech-debt.md) for what this does and doesn't catch.

**FX refresh.** `GET /api/cron/fx` (daily, `vercel.json`) runs
`application/fx/refresh-fx-rates.ts`, which refreshes every currency already tracked in
`fx_rates` from `infrastructure/fx/fx-rate.provider.ts` (ECB rates via frankfurter.dev).
A failed refresh leaves existing rows untouched — same "degrade gracefully" rule as
every other adapter here.

**Structured logging.** `infrastructure/observability/logger.ts` gives every log line
outside `sync_events` a consistent JSON shape (`{ level, scope, message, ...fields,
time }`), with an `ErrorReporter` seam for wiring a managed service like Sentry later
without touching call sites. Nothing is plugged into that seam today — it's a shape, not
a vendor integration.

## Not built yet

See [prd.md](prd.md) for the full roadmap. The highest-impact outstanding item is not
code: the datasets currently collected are almost entirely seller listings and job
posts. Finding *buyers* needs a change on the n8n side (buyer-side groups, keyword
searches, mining commenters on listing posts), not a code change here.
