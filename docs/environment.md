# Environment Setup

## Philosophy

`.env` holds **secrets and deployment identity only**. Everything operational — which
datasets sync, how often, who gets alerted, what counts as a hot lead — is database
state managed from `/admin`. If you're tempted to add an env var for something
operational, don't; add a column/config field instead. See
[architecture.md](architecture.md) for the reasoning.

## Required variables

Create `.env` (single file, gitignored — no template checked into the repo) and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres 14+. Neon and Supabase both confirmed working. |
| `APIFY_API_TOKEN` | yes | `apify_api_...` — read access to `/v2/datasets`. |
| `APIFY_WEBHOOK_SECRET` | yes | Min 16 chars. Shared secret checked on `POST /api/webhooks/apify`. |
| `AUTH_SECRET` | yes | Min 32 chars. Signs session JWTs (`jose`, HS256). Rotating it invalidates every session. |
| `AUTH_ALLOWED_EMAILS` | no | Comma-separated. Bootstrap guard only — restricts which address may claim the instance as first admin. Empty = anyone claims it. Not consulted after bootstrap; team members are added from `/admin/team` instead. |
| `RESEND_API_KEY` | no | Only used for lead-alert emails. Sign-in never needs it. Without it, alerts log a warning instead of sending and the app runs fine. |
| `RESEND_FROM_EMAIL` | no | Defaults to `DreamRue Lead Radar <onboarding@resend.dev>`. |
| `WHATSAPP_API_TOKEN` | no | WhatsApp Cloud API token, only used for lead-alert WhatsApp messages. Without it (or `WHATSAPP_PHONE_NUMBER_ID`), alerts log a warning instead of sending. |
| `WHATSAPP_PHONE_NUMBER_ID` | no | The WhatsApp Cloud API sender's phone number id. |
| `N8N_TRIGGER_SECRET` | no | Min 16 chars. Shared secret for `POST /api/trigger/{discover,sync,fx,retention}` — see "Scheduled jobs" below. Unset means every trigger route always returns 401. |
| `ANTHROPIC_API_KEY` | no | Only used by the shadow-mode LLM classifier (see `docs/tech-debt.md`). Unset means it never runs. |
| `LLM_SHADOW_CLASSIFY_ENABLED` | no | Explicit opt-in to fire the shadow LLM classifier alongside the real rules classifier. Default off; needs `ANTHROPIC_API_KEY` too. |
| `NODE_ENV` | no | `development` \| `test` \| `production`, defaults `development`. |

Validation is Zod-based and fails fast with a readable message
(`shared/config/env.ts::serverEnv()`) — if you add a new required secret, add it to the
schema there, not just to `.env`.

## First-time local setup

```bash
# 1. Postgres (any Postgres 14+; Neon and Supabase both work)
createdb dreamrue_dev

# 2. Configure
nano .env                 # fill in DATABASE_URL, APIFY_API_TOKEN, and the secrets

# 3. Schema + baseline configuration
npm run db:migrate        # also creates the pg_trgm extension (trigram dedup needs it)
npm run db:seed           # source, mapping profile, alert rules, location aliases, FX rates

# 4. Run
npm run dev
```

Then open `/login`. The instance has no accounts yet — the email and password you enter
there create the first **admin** account. No email provider is involved in signing in.
Add teammates from **Admin → Team**: enter their email, the app generates a temporary
password shown once, you relay it to them; they're forced to change it on first sign-in.

To pull data in, use **Admin → Datasets**: "Discover datasets" enumerates what the
source exposes, and each row's sync button ingests + scores it. Those buttons call the
same `discoverAllSources()`/`syncDataset()` functions any scheduler would.

## Scheduled jobs

The app previously declared four Vercel crons in `vercel.json` (discovery every 15
min, sync every 5, FX daily, retention weekly), each hitting a `GET /api/cron/*` route
behind a `CRON_SECRET`. All of that — routes, `vercel.json`, and the env var — was
removed in favour of triggering from n8n.

n8n is now the trigger. Four `POST /api/trigger/*` routes exist for exactly this, each
guarded by `N8N_TRIGGER_SECRET` (checked with `secretsMatch()`, sent as either an
`x-webhook-secret` header or `Authorization: Bearer <secret>`) — an n8n workflow should
call each on its own schedule:

| Work | Route | Function | Suggested cadence |
| --- | --- | --- | --- |
| Dataset discovery | `POST /api/trigger/discover` | `application/sync/discovery.ts::discoverAllSources` | every 15 min |
| Incremental sync | `POST /api/trigger/sync` | `application/sync/sync-dataset.ts::dueDatasets` → `syncDataset` | every 5 min |
| FX refresh | `POST /api/trigger/fx` | `application/fx/refresh-fx-rates.ts::refreshFxRates` | daily |
| Retention pruning | `POST /api/trigger/retention` | `application/maintenance/prune-old-rows.ts::pruneOldRows` | weekly |

Note the sync pair specifically: per-dataset intervals still adapt (faster after new
items, backing off when quiet, tightened on weekends Bali time — see
`domain/sync/scheduling.ts::nextIntervalSeconds`), and `syncDataset` still writes the
resulting `nextSyncDueAt` watermark that `dueDatasets()` reads. So `/api/trigger/sync`
can be called on a plain fixed interval and still get adaptive per-dataset behaviour
for free — it only syncs the datasets `dueDatasets()` actually returns, not every
dataset on every tick.

Each route responds synchronously (unlike the Apify webhook's `after()`-deferred
pattern) with `{ ok: true, ... }` on success or a `401`/`500` with `{ error }`/
`{ ok: false, error }` on failure, so an n8n workflow can branch on the real result.
See `docs/api-patterns.md`'s "System routes" section for the full pattern.

## Third-party services

| Service | Used for | Configured via | Degrades gracefully? |
| --- | --- | --- | --- |
| Postgres | Everything — the only datastore | `DATABASE_URL` | No — hard requirement |
| Apify | Dataset discovery + item ingestion | `APIFY_API_TOKEN`, admin `sources` row | No — the only connector implemented today |
| Resend | Lead alert emails | `RESEND_API_KEY` (optional) | Yes — logs instead of sending |
| WhatsApp Cloud API | Lead alert WhatsApp messages | `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (optional) | Yes — logs instead of sending |
| Anthropic | Shadow-mode LLM classifier (comparison logging only, never live) | `ANTHROPIC_API_KEY` + `LLM_SHADOW_CLASSIFY_ENABLED` (both optional, both off by default) | Yes — skipped entirely when either is unset |
| frankfurter.dev | Daily FX rate refresh | No key needed | Yes — a failed refresh leaves existing `fx_rates` rows untouched, see `application/fx/refresh-fx-rates.ts` |
| n8n | Upstream data producer (writes into Apify datasets) **and** the trigger for discovery/sync/FX/retention via `POST /api/trigger/*` | `N8N_TRIGGER_SECRET` (optional) for the trigger side; data-producer side entirely external, not part of this repo | Trigger routes: N/A (401s if unconfigured) |

There is no test/staging Apify token distinct from production configured anywhere in
this repo — be careful running `npm run db:seed` or triggering a sync from
**Admin → Datasets** against a real `APIFY_API_TOKEN` from a local machine, since it
will actually pull and persist live data into whatever `DATABASE_URL` you've pointed at.

## Local Postgres extension requirement

`npm run db:migrate` creates `pg_trgm` (used for `similarity()` in near-duplicate
detection and the `gin_trgm_ops` index on `leads.body`). If you're pointing at a managed
Postgres that restricts extension creation, `pg_trgm` needs to be enabled by the
provider first (Neon and Supabase both allow it out of the box; a locked-down RDS
instance might not).

## Test and e2e databases

Integration and e2e tests need their own disposable Postgres databases — never point
either at `.env`'s `DATABASE_URL`. See [testing-strategy.md](testing-strategy.md) for
full detail; the short version:

```bash
# Integration tests (application/domain logic against a real DB, no browser)
createdb dreamrue_test
nano .env.test             # set DATABASE_URL to point at dreamrue_test
npm run db:migrate:test
npm run test:integration

# E2E tests (real build, real browser, real DB)
createdb dreamrue_e2e
nano .env.e2e               # set DATABASE_URL to point at dreamrue_e2e
node --env-file=.env.e2e infrastructure/db/migrate.mjs
npm run build && npm run test:e2e
```

`test/integration/db-helpers.ts::resetDb()` and `e2e/global-setup.ts` both refuse to run
against a database whose name doesn't contain "test"/"e2e" — a guard against a
misconfigured env var pointing either suite at real data.

## Commands reference

```bash
npm run dev              # dev server
npm run build             # production build
npm test                  # vitest run — fast unit suite, no database
npm run test:watch
npm run test:integration  # vitest against a real disposable database — see above
npm run test:e2e           # playwright — needs `npm run build` first, see above
npm run typecheck          # tsc --noEmit
npm run lint               # eslint
npm run db:generate       # create a migration from schema changes in infrastructure/db/schema
npm run db:migrate         # apply migrations to .env's DATABASE_URL (also creates pg_trgm)
npm run db:migrate:test    # same, against .env.test's DATABASE_URL
npm run db:migrate:ci      # same, reading DATABASE_URL directly from the environment (used by CI)
npm run db:seed            # source, mapping profile, alert rules, aliases, FX — idempotent, safe to re-run
npm run db:studio          # drizzle studio
```
