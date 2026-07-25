# Coding Standards

## Before touching anything Next.js-specific

This repo runs **Next.js 16** on the App Router with breaking changes vs. older
training data. `AGENTS.md` at the repo root already flags this — treat it as a hard
rule: **read `node_modules/next/dist/docs/` before writing route handlers, middleware,
caching, or `after()`/streaming code.** Confirmed differences already in use in this
codebase, so don't "fix" them back to the old API:

- **`middleware.ts` is gone — it's `proxy.ts`** at the repo root, exporting `proxy()`
  instead of `middleware()`. See [proxy.ts](../proxy.ts). It is optimistic-only (cookie
  presence check); it is never the security boundary.
- **`updateTag` vs `revalidateTag`.** `updateTag(tag)` is used inside a server action
  when the actor must see their own change immediately (no stale-while-revalidate).
  `revalidateTag(tag, "max")` — note the second argument — is used from cron/webhook
  routes for background refresh with SWR semantics. Pick based on who needs the fresh
  data and when: see `application/leads/lead.actions.ts` vs.
  `app/api/cron/sync/route.ts`.
- **`after()` from `next/server`** is used in the Apify webhook route to ack
  immediately and do the sync in the background, since Apify retries on slow webhook
  responses. See `app/api/webhooks/apify/route.ts`.
- **`"use cache"` + `cacheTag`/`cacheLife`** (both from `next/cache`) mark a read
  function as cacheable — see `getLeadStats`/`getLeadFacets`/`listDatasets` in
  architecture.md's Performance section. Reach for it when a read function's argument
  space is small/bounded (a `datasetId`, nothing, an id) and matches an existing
  `updateTag`/`revalidateTag` call site — the caching is pointless without a real
  invalidation trigger. Don't reach for it on a read whose argument space is
  effectively unbounded (`queryLeads`'s full `LeadFilters`) — the cache would rarely
  hit and isn't worth the complexity.

If you hit an API that doesn't behave like you expect from training data, assume the
docs bundle is right and your memory is stale, not the other way around.

## Layering

Respect the one-way dependency rule described in [architecture.md](architecture.md):
`domain` → nothing. `application` → `domain` (via ports) + `infrastructure` client
(`db()`, `getConnector()`, `getNotifier()`). `features`/`app` → `application` only.

Concretely:
- Never import from `infrastructure/` in `domain/`.
- Never write raw Drizzle queries inside `domain/`. Domain functions take plain data in,
  return plain data out (`applyMapping`, `classifyWithRules`, `evaluatePredicate`,
  `priorityScore` are all pure and unit-testable with no mocks).
- New upstream integrations (a portal feed, an inbound webhook, a form) are a new file
  in `infrastructure/` implementing `SourceConnector` or `Notifier`
  (`domain/sync/ports.ts`), registered in the corresponding `registry.ts`. Don't add a
  vendor-specific branch inside `application/sync/sync-dataset.ts`.

## Repository / service naming convention

`application/` is already a de facto repository + service layer — this makes the
convention explicit so it doesn't erode as more tables/use-cases are added:

- **Repository**: one `<domain>/*-queries.ts` module per table (or tightly related group
  of tables) owns *every* read for it — `lead-queries.ts`, `dataset-queries.ts`,
  `facets.ts`. Callers never construct a Drizzle query against that table themselves;
  they call a named function (`queryLeads(filters)`, `listDatasets()`). Don't introduce
  a formal `Repository<T>` interface on top of this — there's one database and one ORM,
  with no plan to swap either, so an interface layer would be ceremony with no second
  implementation to justify it.
- **Service**: writes and orchestration live in one of two shapes, chosen up front:
  - `<domain>/*.actions.ts` — server-action entry points the UI calls directly, always
    `.inputSchema(zodSchema)` through `authActionClient`/`adminActionClient` (see
    [api-patterns.md](api-patterns.md)).
  - a plain `.ts` module with no `"use server"` — internal orchestration called from a
    cron/webhook route or another service, not directly from the UI (`sync-dataset.ts`,
    `discovery.ts`, `dispatch.ts`, `refresh-fx-rates.ts`, `process-records.ts`). This is
    where multi-step orchestration across several repositories/adapters belongs.
- When adding a new use-case, decide which service shape it is first — "does the UI call
  this directly" vs. "does a route or another service call this" — rather than
  defaulting everything into `*.actions.ts`.

## Server-only boundaries

Every module that touches secrets, the database, or Node built-ins starts with
`import "server-only";` (see `shared/config/env.ts`, `application/safe-action.ts`,
`infrastructure/db/client.ts`, all of `application/*`). This is what makes an accidental
client-side import of a DB query fail the build instead of leaking a connection string.
Add it to any new `application/` or `infrastructure/` module. `test/stubs/server-only.ts`
is aliased in for Vitest since there's no RSC boundary under test.

## Server actions

All mutations go through `next-safe-action` clients defined in
`application/safe-action.ts`:
- `actionClient` — no auth (sign-in only).
- `authActionClient` — re-verifies the session server-side via `currentUser()` on every
  call. Use this for anything a signed-in user does.
- `adminActionClient` — additionally requires `role === "admin"`.

Never call `currentUser()`/`db()` directly from a `"use client"` component to bypass an
action — always go through one of these three clients, and prefer the narrowest one that
works. `.inputSchema(zodSchema)` is required on every action; there is no untyped action
in this codebase. See [api-patterns.md](api-patterns.md) for the full pattern and error
conventions.

## SQL and Drizzle

- Never interpolate a raw JS array into a `sql` template — it binds as a single scalar
  and Postgres errors expecting `{...}` array syntax. Use the `textArray()` helper
  (`application/leads/sql-helpers.ts`), which emits `ARRAY[$1,$2]::text[]` with each
  element as its own bound parameter. There's a regression test for exactly this in
  `application/leads/sql-helpers.test.ts` — read it before touching array filtering.
- Validate any user-controlled enum-ish value against the real Drizzle enum before it
  reaches a query (`validIntents`/`validStatuses` in `sql-helpers.ts`) — an unvalidated
  value passed straight to an enum column 500s the page instead of silently filtering.
- Dynamic/open-ended filters (the `attr.*` map from discovered fields) are bound as
  parameters against a fixed `jsonb ->> key` path — the key is never spliced into SQL
  text, only the comparison value is parameterized alongside it.
- Upserts key off a stable natural identity, not a surrogate check-then-insert:
  `onConflictDoUpdate({ target: schema.leads.rawRecordId, ... })` is what makes
  reprocessing idempotent.

## Naming and style

- File names: kebab-case (`lead-queries.ts`, `dataset.actions.ts`). Server action
  modules end in `.actions.ts`; query/read modules end in `-queries.ts`.
  Domain type modules are `types.ts` per subfolder.
- Prefer named exports; no default exports observed anywhere in the codebase — keep it
  that way for grep-ability.
- Comments are reserved for the *why*, not the *what* — this codebase is dense with
  "why" comments explaining a specific past bug or a non-obvious tradeoff (e.g. the
  regex-alternation-order comment in `domain/dataset/mapping.ts`, or the
  presence-counting comment in `domain/dataset/schema-inference.ts`). Match that style:
  don't add a comment that just restates the code, but do add one when you're encoding a
  hard-won lesson or a constraint that isn't visible in the diff.
- Formatting is Prettier + `prettier-plugin-tailwindcss` (class order), enforced by
  `eslint-config-next` + `eslint-config-prettier`. Run `npm run lint` before considering
  a change done; there is no separate `prettier --write` script, lint-staged runs on
  commit-adjacent tooling via Husky (`.husky/pre-commit` currently runs `npm test`).

## Types

- `strict: true` in `tsconfig.json`. Don't introduce `any` to route around a type error;
  narrow or extend the actual type. `unknown` is preferred for genuinely-untyped
  external payloads (see `Record<string, unknown>` throughout the dataset/mapping code).
- Row types are inferred from the schema (`export type LeadRow = typeof
  leads.$inferSelect`), not hand-duplicated. Add the inferred type export next to a new
  table, following the existing pattern in `infrastructure/db/schema/*.ts`.
- Zod schemas double as both runtime validation and the TypeScript source of truth
  (`z.infer<typeof leadFiltersSchema>`) — define the Zod schema first, derive the type
  from it, not the other way around.

## UI conventions

- `components/ui/` — shadcn primitives (style `base-nova`, see `components.json`), don't
  hand-edit these beyond what `shadcn` generates; regenerate via the CLI instead.
- `components/common/` — small composed components shared across features
  (`empty-state`, `score-badge`, `relative-time`, etc).
- `features/<name>/components/` — feature-scoped, not reused elsewhere, and named to
  match its `application/<name>/` counterpart 1:1 where one exists
  (`features/datasets` ↔ `application/datasets`, `features/team` ↔
  `application/auth/team.actions.ts`). `features/shell/` is the exception — app chrome
  has no single application-layer counterpart. When adding a new feature area, follow
  this pairing rather than dropping a new table into an existing unrelated feature
  folder (see `docs/tech-debt.md`'s git history for why — `features/admin/` used to be
  exactly that catch-all, before dataset/team management were split out to match).
- `hooks/` — cross-feature client hooks. `useUrlFilters` (searchParams-as-state via
  shallow routing — `window.history.pushState`, not `router.push`, so a filter change
  never forces a full RSC re-navigation) and `useServerAction` (busy-state +
  error-toast + `router.refresh()` around a `next-safe-action` call, with an optional
  `invalidateKeys` for callers that also read through React Query — see below). Pull a
  new hook out here the second a pattern shows up in two components, not after the
  third or fourth copy accumulates.
- Client components (`"use client"`) call server actions directly and `router.refresh()`
  afterward rather than managing local mutation state — see `LeadInbox` in
  `features/leads/components/lead-inbox.tsx` for the pattern (log the action, refresh,
  *then* do the side effect like opening a WhatsApp link — the metric must not depend on
  whether the tab opens).
- **React Query is scoped to the leads/datasets search-and-filter surface only** — see
  [architecture.md](architecture.md)'s "Search, filtering, and client-side data
  fetching". Don't reach for it on a page that just reads once per navigation; a Server
  Component calling its `*-queries.ts` function directly is still the default. Where it
  is used: query-key functions live in a directive-free `features/<name>/query-keys.ts`
  (not the `"use client"` `queries.ts` that also re-exports them), because a Server
  Component can't call a function exported from a `"use client"` module. Every mutation
  that touches a React-Query-cached view must invalidate both the RSC tag cache
  (`updateTag`/`revalidateTag`, already required — see "Cache invalidation" in
  architecture.md) and the query cache (`queryClient.invalidateQueries`, via
  `useServerAction`'s `invalidateKeys` or a direct `useQueryClient()` call) — skipping
  the second half is a silent-staleness bug, not a missing nice-to-have.
- Formatting numbers/dates for display goes through `shared/format.ts`, which pins
  `Intl.NumberFormat` to `en-US` explicitly. A bare `toLocaleString()` uses the runtime
  locale, which differs between SSR and the browser and produces a hydration mismatch —
  don't reintroduce that.
- **`DropdownMenuLabel` (Base UI's `Menu.GroupLabel`) must be wrapped in
  `DropdownMenuGroup` (`Menu.Group`).** Used bare, it throws at *open* time, not build
  time — TypeScript won't catch it, and neither will a test that never actually clicks
  the trigger. This broke the dataset-scope dropdown in production for an unknown
  period before an e2e test that opened it caught it. If you add a dropdown with a
  label, open it in a real browser (or an e2e test) before considering it done —
  `npm run typecheck`/`npm run lint` passing is not evidence a Base UI menu actually
  renders.
- Every protected page calls `requireUser()`/`requireAdmin()` itself, even though the
  shared `(app)` layout also checks auth — see
  [docs/architecture.md](architecture.md)'s Auth model section for why the layout alone
  isn't sufficient (it doesn't re-run on client-side navigation between siblings).
  Forgetting this on a new page silently relies on the layout's weaker guarantee.

## Logging

Use `createLogger(scope)` from `infrastructure/observability/logger.ts` for anything
outside the sync pipeline's own `SyncLogger` (which persists to `sync_events` and should
keep doing that). Don't reach for a bare `console.error`/`console.warn` in new
`application/`/`infrastructure/` code — every existing call site was migrated to this in
one pass specifically so log output has one consistent shape to filter/query on. Pass
structured `fields`, not string interpolation: `log.error("failed to X", { error, leadId })`,
not `` log.error(`failed to X: ${leadId}`) ``.

## Security patterns already established — reuse, don't reinvent

- Constant-time secret/password comparison (`timingSafeEqual`) everywhere a secret is
  checked: `application/http/verify-secret.ts` (cron/webhook bearer tokens),
  `infrastructure/auth/password.ts` (login).
- `fakeVerify()` burns the same time as a real password check so a nonexistent account
  doesn't respond faster than a wrong password — preserve this when touching auth flows.
- Passwords: `scrypt` with explicit OWASP-tier params (`N=16384, r=8, p=1`), formatted as
  self-describing `scrypt$<salt>$<hash>` so parameters can be raised later without
  invalidating existing hashes. Never store or log a plaintext password.
- Rate limiting a sensitive action: see `application/auth/login-attempts.ts` +
  `domain/auth/rate-limit.ts` for the established shape — a pure `isXRateLimited(count)`
  decision function in `domain/`, a thin count/record pair in `application/` (split out
  specifically so it's testable without a request-scoped Next.js context, since the
  action itself may need `cookies()`/`headers()`), and the rate-limit check happens
  *before* the expensive/sensitive work, with the same fake-timing cost on the way out
  as a real failure would have — a throttled response must not be distinguishable by
  latency from a normal one.
