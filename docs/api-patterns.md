# API Patterns

DreamRue has no public REST API. There are three kinds of server entry points: **server
actions** (all user-facing mutations, called directly from client components), a small
set of **system route handlers** (`app/api/**`) for cron ticks and the Apify webhook,
and a small set of **internal read route handlers** that exist only to back the leads
search/filter surface's React Query hooks (see
[architecture.md](architecture.md)'s "Search, filtering, and client-side data
fetching"). All three are documented here.

## Server actions

Built on `next-safe-action` (see `application/safe-action.ts`). Four clients:

```ts
export const actionClient = createSafeActionClient({ handleServerError(error) { ... } });
export const authActionClient = actionClient.use(/* re-verify session; block if mustChangePassword */);
export const adminActionClient = authActionClient.use(/* require role === "admin" */);
export const authActionClientAllowPendingPasswordChange = actionClient.use(/* re-verify session only */);
```

`authActionClient` blocks while `mustChangePassword` is set — a temporary password must
be changed before anything else, and this is what closes that gap for a server action
called directly, not just page navigation (see
[docs/architecture.md](architecture.md)'s Auth model section). The fourth client exists
for exactly one reason: `changePassword` (and `signOutEverywhere`) must work *while*
that flag is set, since resolving it is the whole point. Don't reach for the fourth
client for anything else — it's a narrow, deliberate exception, not a weaker default.

### Writing a new action

```ts
"use server";

export const myAction = authActionClient
  .inputSchema(z.object({ leadId: z.string().uuid(), value: z.string().max(200) }))
  .action(async ({ parsedInput, ctx }) => {
    // ctx.user is SessionPayload — already re-verified against the DB, trust it.
    await db().update(...).where(...);
    await db().insert(schema.leadEvents).values({ leadId: parsedInput.leadId, type: "...", actorId: ctx.user.userId });
    invalidate(parsedInput.leadId); // updateTag/revalidateTag
    return { ok: true };
  });
```

Rules, all illustrated in `application/leads/lead.actions.ts`:

- **Always `.inputSchema(...)`.** No action skips Zod validation. Constrain strings
  (`z.string().max(10_000)` for notes), use `z.string().uuid()` for ids, use `z.enum` for
  closed sets.
- **Pick the narrowest client.** `authActionClient` unless the action must be
  admin-only, in which case `adminActionClient`. Never reach for `db()`/`currentUser()`
  directly from a client component as a shortcut.
- **Ensure the sacred row exists before mutating it.** Lead-state-touching actions call
  `ensureState(leadId)` (`insert ... onConflictDoNothing`) first — `lead_states` rows are
  created lazily on first human touch, not eagerly when a lead is created.
- **Write an event.** Any state change that matters for the audit trail /funnel
  analytics inserts a `lead_events` row in the same action, with `type` from the
  `leadEventTypeEnum`.
- **Invalidate the right tags, the right way.** Use `updateTag()` (immediate — the actor
  must see their own change) inside actions; use `revalidateTag(tag, "max")`
  (background/SWR) from cron and webhook routes. See `application/cache-tags.ts` for the
  tag vocabulary — always go through those helper functions (`leadTag(id)`,
  `datasetTag(id)`, etc.), never hand-write a tag string.
- **Errors are user-facing strings, not stack traces.** Throw `ActionError(message)` for
  anything the client should show verbatim (e.g. "Current password is incorrect.").
  Anything else is logged server-side and replaced with a generic "Something went wrong"
  message by `handleServerError` — never let an unexpected error leak internals to the
  client.
- **Idempotent side effects where possible.** `markContacted` uses
  `coalesce(firstContactedAt, now())` so calling it twice doesn't reset the north-star
  metric's clock.

### Calling an action from a client component

```tsx
"use client";
import { markContacted } from "@/application/leads/lead.actions";

async function contact() {
  await markContacted({ leadId, channel: "whatsapp" });
  router.refresh(); // re-fetch server data; don't hand-roll optimistic state
  // side effects with real-world consequences (opening a link, navigating away)
  // happen *after* the action resolves, never before.
}
```

## Route handlers (`app/api/**`)

### System routes

Each of these is a system-to-system endpoint, not a public API:

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/cron/discover` | GET | `Authorization: Bearer $CRON_SECRET` | Runs `discoverAllSources()` |
| `/api/cron/sync` | GET | `Authorization: Bearer $CRON_SECRET` | Runs `syncDataset()` for datasets whose adaptive interval is due |
| `/api/cron/fx` | GET | `Authorization: Bearer $CRON_SECRET` | Runs `refreshFxRates()` once daily |
| `/api/cron/retention` | GET | `Authorization: Bearer $CRON_SECRET` | Prunes append-only tables past their retention window |
| `/api/webhooks/apify` | POST | `x-webhook-secret` or `Authorization: Bearer $APIFY_WEBHOOK_SECRET` | Accelerates a sync for one dataset; falls back to full discovery if the dataset is unknown |

Pattern for a new one, if you ever add one:

```ts
export async function GET(request: Request) {
  if (!secretsMatch(readBearer(request), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... do the work ...
  return NextResponse.json({ ok: true, ...summary });
}
```

- Always compare secrets with `secretsMatch()`
  (`application/http/verify-secret.ts`) — never `===` on a raw header value (timing
  attack surface on the shared secret).
- Cron routes read `CRON_SECRET`; the Apify webhook reads its own
  `APIFY_WEBHOOK_SECRET` — do not conflate the two secrets or let one authenticate the
  other's route.
- These routes are excluded from `proxy.ts`'s matcher — they carry their own auth and
  must never be gated behind the session cookie check.
- Long-running or "fire and forget" work inside a webhook uses `after()` from
  `next/server` so the HTTP response returns immediately (Apify retries slow webhooks) —
  see `app/api/webhooks/apify/route.ts`.
- `maxDuration` is set explicitly on routes expected to run long (`export const
  maxDuration = 300;` in the sync cron) — set this deliberately, don't rely on the
  platform default, when adding a route that processes multiple datasets in a loop.
- Return a small JSON summary (`{ ok, processed, outcomes }`), not the full internal
  state — these responses are consumed by Vercel's cron log and by curl during manual
  testing (see the README's manual-trigger snippet), not by a UI.

### Internal read routes

| Route | Method | Auth | Backs |
| --- | --- | --- | --- |
| `/api/leads` | GET | session cookie (`currentUser()`) | `useLeadsQuery` |
| `/api/leads/facets` | GET | session cookie | `useLeadFacetsQuery` |
| `/api/leads/stats` | GET | session cookie | `useLeadStatsQuery` |
| `/api/datasets` | GET | session cookie | `useDatasetsQuery` |

These four exist for exactly one reason: `features/leads/queries.ts` and
`features/datasets/queries.ts` run in the browser and need something to `fetch()` — a
Server Component can call `queryLeads()`/`listDatasets()` directly, but a client
component can't. Each route is a thin wrapper — auth check, call the same
`*-queries.ts` function the server-rendered first paint used, return JSON:

```ts
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const filters = parseLeadFilters(new URL(request.url).searchParams);
  const page = await queryLeads(filters);
  return NextResponse.json({ page });
}
```

Deliberately **not** gated on `mustChangePassword` — these are read-only, and blocking
reads while a temporary password is pending has no security rationale (contrast with
server actions, where `authActionClient` blocks writes for exactly that flag). Deliberately
**not** a generic `/api/v1/*` REST surface either: if a real second consumer shows up
(mobile app, partner integration), design that surface then — don't retrofit these.

## Error handling conventions

- **Domain layer**: no throwing for expected "no data" cases — return `null` /
  empty arrays (`resolvePath`, `applyFieldRule`, `evaluatePredicate` all degrade
  gracefully instead of throwing on missing/malformed input, because upstream payload
  shape is never guaranteed).
- **Application layer**: catch and record, don't crash the batch.
  `processRawRecords` catches per-record and increments `result.failed` rather than
  aborting the whole sync run on one bad record — a poison record must not block 499
  good ones. `syncDataset` similarly wraps the whole per-dataset run in try/catch,
  recording `errorSummary` and backing off the schedule rather than throwing to the
  cron route.
- **Route handlers**: 401 on auth failure, otherwise 200 with a result summary — these
  are polled/scheduled endpoints, not RPCs a caller branches on HTTP status for beyond
  auth.
- **Server actions**: `ActionError` for messages safe to show the user; anything else
  is logged (`console.error("[action]", error)`) and genericized before reaching the
  client.
