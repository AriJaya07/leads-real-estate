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
| `RESEND_API_KEY` | no | Used for invite emails, password-reset emails, and lead-alert emails (the `email` notifier channel). Without it, all three log a warning instead of sending and the app runs fine. |
| `RESEND_FROM_EMAIL` | no | Defaults to `AveronAi Lead Radar <onboarding@resend.dev>`. |
| `N8N_TRIGGER_SECRET` | no | Min 16 chars. Shared secret for `POST /api/trigger/{discover,sync,fx,retention,weekly-report,auto-assign,reminders}` — see "Scheduled jobs" below. Unset means every trigger route always returns 401. |
| `N8N_NOTIFY_WEBHOOK_URL` | no | n8n workflow 08's Production URL. Used by the `whatsapp`/`slack` notifier channels (`infrastructure/notifiers/n8n.notifier.ts`) — the app renders the message and hands off delivery to n8n, which owns the WhatsApp Cloud API token and Slack webhook. Without it (or `AVERONAI_NOTIFY_SHARED_SECRET`), those two channels log a warning instead of sending. Does **not** affect the `email` channel, which stays direct via Resend. |
| `N8N_WEEKLY_REPORT_WEBHOOK_URL` | no | n8n workflow 09's Production URL. The weekly digest's numbers are computed here and posted raw; rendering and sending both happen in n8n. Without it (or `AVERONAI_NOTIFY_SHARED_SECRET`), the digest silently doesn't go out (`weeklyReportLastSentAt` still advances, so it won't retry-loop). |
| `AVERONAI_NOTIFY_SHARED_SECRET` | no | Min 16 chars. Shared secret sent as `x-averonai-notify-secret` to both n8n notify webhooks above, checked by their "Verify Shared Secret" nodes. |
| `ANTHROPIC_API_KEY` | no | Only used by the shadow-mode LLM classifier (see `docs/tech-debt.md`). Unset means it never runs. |
| `LLM_SHADOW_CLASSIFY_ENABLED` | no | Explicit opt-in to fire the shadow LLM classifier alongside the real rules classifier. Default off; needs `ANTHROPIC_API_KEY` too. |
| `NODE_ENV` | no | `development` \| `test` \| `production`, defaults `development`. |

Validation is Zod-based and fails fast with a readable message
(`shared/config/env.ts::serverEnv()`) — if you add a new required secret, add it to the
schema there, not just to `.env`.

## First-time local setup

```bash
# 1. Postgres (any Postgres 14+; Neon and Supabase both work)
createdb averonai_dev

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

n8n is now the trigger. Seven `POST /api/trigger/*` routes exist for exactly this, each
guarded by `N8N_TRIGGER_SECRET` (checked with `secretsMatch()`, sent as either an
`x-webhook-secret` header or `Authorization: Bearer <secret>`) — an n8n workflow should
call each on its own schedule. `n8n/workflows/triggers/` ships one thin workflow per
route (01–07), each just an n8n Schedule Trigger calling a shared `_Trigger Caller`
sub-workflow with `{ route, timeoutMs }` — see `n8n/README.md`.

| Work | Route | Function | Suggested cadence |
| --- | --- | --- | --- |
| Dataset discovery | `POST /api/trigger/discover` | `application/sync/discovery.ts::discoverAllSources` | every 15 min |
| Incremental sync | `POST /api/trigger/sync` | `application/sync/sync-dataset.ts::dueDatasets` → `syncDataset` | every 5 min |
| FX refresh | `POST /api/trigger/fx` | `application/fx/refresh-fx-rates.ts::refreshFxRates` | daily |
| Retention pruning | `POST /api/trigger/retention` | `application/maintenance/prune-old-rows.ts::pruneOldRows` | weekly |
| Weekly report | `POST /api/trigger/weekly-report` | `application/automation/send-weekly-report.ts::sendWeeklyReport` (self-throttled to once/7 days; posts to n8n workflow 09 to render+send) | daily |
| Auto-assign sweep | `POST /api/trigger/auto-assign` | `application/automation/auto-assign.ts::runAutoAssignment` | every 10 min |
| Stale-lead reminders | `POST /api/trigger/reminders` | `application/automation/send-reminders.ts::sendStaleLeadReminders` | every 30 min |

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
| Resend | Invite/password-reset emails + lead-alert emails (`email` notifier channel) | `RESEND_API_KEY` (optional) | Yes — logs instead of sending |
| n8n (notifications) | WhatsApp/Slack alert delivery (`whatsapp`/`slack` notifier channels) + weekly report render+send — see `n8n/workflows/notifications/` | `N8N_NOTIFY_WEBHOOK_URL` / `N8N_WEEKLY_REPORT_WEBHOOK_URL` + `AVERONAI_NOTIFY_SHARED_SECRET` (all optional) | Yes — logs instead of sending, `email` channel unaffected |
| Anthropic | Shadow-mode LLM classifier (comparison logging only, never live) | `ANTHROPIC_API_KEY` + `LLM_SHADOW_CLASSIFY_ENABLED` (both optional, both off by default) | Yes — skipped entirely when either is unset |
| frankfurter.dev | Daily FX rate refresh | No key needed | Yes — a failed refresh leaves existing `fx_rates` rows untouched, see `application/fx/refresh-fx-rates.ts` |
| n8n (triggers + data) | Upstream data producer (writes into Apify datasets) **and** the trigger for discovery/sync/FX/retention/weekly-report/auto-assign/reminders via `POST /api/trigger/*` | `N8N_TRIGGER_SECRET` (optional) for the trigger side; data-producer side entirely external, not part of this repo | Trigger routes: N/A (401s if unconfigured) |

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
createdb averonai_test
nano .env.test             # set DATABASE_URL to point at averonai_test
npm run db:migrate:test
npm run test:integration

# E2E tests (real build, real browser, real DB)
createdb averonai_e2e
nano .env.e2e               # set DATABASE_URL to point at averonai_e2e
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
