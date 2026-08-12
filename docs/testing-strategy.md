# Testing Strategy

Three tiers, each with its own config and its own trust boundary. Run all three before
calling a change done; CI (`.github/workflows/ci.yml`) runs all three on every PR.

| Tier | Config | Command | Hits a real DB? | Hits the real app? |
| --- | --- | --- | --- | --- |
| Unit | `vitest.config.ts` | `npm test` | No | No |
| Integration | `vitest.integration.config.ts` | `npm run test:integration` | Yes (disposable) | No — calls `application/`/`domain/` functions directly |
| E2E | `playwright.config.ts` | `npm run test:e2e` | Yes (disposable) | Yes — a real built app in a real browser |

## Unit tests (`*.test.ts`)

Vitest, `environment: "node"`, no database. All pure `domain/` logic plus a few
sharp-edge units elsewhere (`infrastructure/auth/password.test.ts`,
`application/leads/sql-helpers.test.ts`, `infrastructure/observability/logger.test.ts`).
`.husky/pre-commit` runs `npm test` locally; CI's `unit` job runs it again on every PR.

**What's worth a unit test**: anything in `domain/` by default — pure, dependency-free,
no mocks needed. Regressions with a concrete incident behind them (see the `textArray`
comment in `sql-helpers.test.ts`, or the presence-counting comment in
`schema-inference.ts`) — when you fix a bug in `domain/` or `application/`, add the
regression test in the same commit, with a comment naming what broke. Anything
security-adjacent: constant-time comparison, password hashing, SQL parameter binding.
Scoring/ranking/threshold constants, so a weight change is caught if it wasn't
intentional.

**What a unit test can't catch**: whether a query actually *executes* against Postgres.
`application/leads/priority-sql.test.ts` compiled its SQL and checked the parameter list
looked right — and still shipped a bug (`0.7` bound as an `integer` parameter, which
Postgres rejects) that only the e2e suite hitting a real database caught. See
[tech-debt.md](tech-debt.md). If a change touches raw SQL, don't stop at a unit test
that only compiles it — the integration tier below is what actually runs it.

## Integration tests (`*.integration.test.ts`)

Vitest with a separate config (`vitest.integration.config.ts`, excluded from the unit
run and vice versa — the include/exclude globs on both configs enforce this). These call
`application/`/`domain/` functions directly against a real, disposable Postgres
database — no mocking of `db()`, no mocked connectors beyond a deliberately fake
`SourceConnector`/`FxRateProvider`/`Notifier` implementation for the two adapters that
would otherwise need real network access (Apify, the FX API).

**Setup** (once):
```bash
createdb averonai_test
nano .env.test              # point DATABASE_URL at averonai_test, never averonai_dev
npm run db:migrate:test
```

**Run**: `npm run test:integration`. `test/integration/db-helpers.ts::resetDb()` truncates
every app table between tests and — this matters — **refuses to run unless the target
database's name contains "test"**, specifically so a misconfigured `DATABASE_URL`
(someone's real `.env` sourced by accident) can't wipe dev or prod data. Never point
`.env.test` at anything but a disposable database.

**Faking an external adapter for a test**: `infrastructure/connectors/registry.ts`
exports `registerConnector()` for exactly this — register a fake `SourceConnector` under
the `"manual"` source kind (never used by a real adapter) and `syncDataset()` exercises
its real probe/ingest/cursor/mapping logic with no network call. See the pattern in
`application/sync/sync-dataset.integration.test.ts`. `refreshFxRates()` takes its
provider as a parameter for the same reason — no registry needed since there's only ever
one caller.

**What's covered**: `syncDataset`'s watermark-cursor resumability and probe-skip
behavior; `processRawRecords`'s upsert idempotency, duplicate-linking, and
`lead_states`-survives-reprocessing guarantee; `dispatchAlertsForLeads`'s dedupe-key
suppression; the auto-approved mapping profile quality guardrail; `refreshFxRates`'s
degrade-on-failure behavior; login attempt counting/throttling.

**What's deliberately not covered here**: `infrastructure/` adapters that are thin
wrappers over a real external API (`apify.connector.ts`,
`infrastructure/fx/fx-rate.provider.ts`) — mocking `fetch` line-by-line for those mostly
tests the mock. If you need confidence in one, prefer verifying it against the real
service once (as was done manually for the FX adapter — see its git history) over a
brittle mocked unit test.

## E2E tests (`e2e/*.spec.ts`)

Playwright, against a real production build (`npm run build && npm run start`) and a
real, disposable Postgres database — this is the tier that catches what integration
tests can't: whether the UI actually renders, whether a server action's result reaches
the page, whether a real external API call (bad token, unreachable dataset) surfaces
correctly as a toast.

**Setup** (once):
```bash
createdb averonai_e2e
nano .env.e2e                # point DATABASE_URL at averonai_e2e, never averonai_dev
node --env-file=.env.e2e infrastructure/db/migrate.mjs
npx playwright install chromium   # if not already cached
```

**Run**: `npm run build` then `npm run test:e2e` (or just `npx playwright test` locally —
`reuseExistingServer` is on outside CI, so a `npm run dev` already running on port 3100
is reused instead of rebuilding).

`e2e/global-setup.ts` seeds a fixed admin account, a dedicated throttling-test account,
and one buyer lead directly via SQL before the suite runs — independent of the app's own
pipeline (no Apify call). It talks to Postgres directly with the `postgres` package
rather than importing `infrastructure/db/client.ts` or `infrastructure/auth/password.ts`,
because both start with `import "server-only"`, which throws unconditionally outside
Next's RSC build (Playwright's global setup runs in plain Node, not through Next).

**What's covered** (15 spec files, ~49 tests): sign-in (wrong credentials, throttling
after 5 failed attempts, the proxy redirect for signed-out visitors); `/signup`'s
category-then-details flow, including a brand-new company landing on an empty inbox and
duplicate-email rejection; the lead triage view and the mark-contacted flow via the
"Open original post" action; an admin manually triggering a dataset sync against a real
(intentionally invalid) Apify token and seeing the failure surfaced as a toast; the
pipeline board's drag-and-drop and dropdown status changes; team invites end to end
(owner invites → recipient accepts and signs in → role promotion unlocks admin nav);
billing (plan display, a downgrade blocked by seat limits, a non-owner refused
`/admin/billing`); account settings (forced password change, profile, teams panel,
sign-out, session revocation); automation settings persistence; responsive layout
(mobile drawer nav, card view below `md`); previously-404 nav destinations; and —
**the multi-tenant and Super Admin boundaries specifically** — `multi-tenant.spec.ts`
proves company A never sees company B's data (list, search, or a direct API id guess)
and `platform-admin.spec.ts` proves a company owner cannot reach `/platform/*`, a
platform admin can and sees every tenant, and the platform flag grants no extra tenant
data access anywhere else.

**On not mocking external services**: the dataset-sync spec deliberately does *not* mock
Apify. `.env.e2e`'s `APIFY_API_TOKEN` is a placeholder and the seeded dataset's
`externalId` doesn't exist upstream, so the test exercises the real connector's error
path (a real 401/404 round-trip) end to end. This is more valuable than a mocked
success/failure toggle because it also proves the retry logic in
`apify.connector.ts` doesn't hang or retry-loop on a genuine auth failure.

## What to add tests for going forward

Same priority order as before, extended with the two new tiers: pure `domain/` logic
gets a unit test in the same commit; anything that only makes sense against a real
database (idempotency, dedupe, cursor behavior, cross-adapter degradation) gets an
integration test; a new *critical user path* (not every path) gets an e2e spec. Don't
add an e2e test for something already covered by a cheaper tier — the fake-Apify-token
sync test is valuable specifically because it can't be faithfully expressed any other
way; a filter-chip toggle usually can be, and belongs in a component test or simply
manual verification instead.

## Coverage expectations

No enforced coverage threshold or CI gate on coverage percentage — `.github/workflows/ci.yml`
gates on the three suites *passing*, not on a coverage number. Use judgment: domain logic
with real business consequences (scoring, mapping, dedup, alerting, ranking) should be
well-covered; thin plumbing does not need a test to exist for its own sake.
