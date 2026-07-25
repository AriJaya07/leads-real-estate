# Environment Setup

## Philosophy

`.env` holds **secrets and deployment identity only**. Everything operational — which
datasets sync, how often, who gets alerted, what counts as a hot lead — is database
state managed from `/admin`. If you're tempted to add an env var for something
operational, don't; add a column/config field instead. See
[architecture.md](architecture.md) for the reasoning.

## Required variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres 14+. Neon and Supabase both confirmed working. |
| `APIFY_API_TOKEN` | yes | `apify_api_...` — read access to `/v2/datasets`. |
| `APIFY_WEBHOOK_SECRET` | yes | Min 16 chars. Shared secret checked on `POST /api/webhooks/apify`. |
| `CRON_SECRET` | yes | Min 16 chars. Bearer secret checked on `GET /api/cron/*`. |
| `AUTH_SECRET` | yes | Min 32 chars. Signs session JWTs (`jose`, HS256). Rotating it invalidates every session. |
| `AUTH_ALLOWED_EMAILS` | no | Comma-separated. Bootstrap guard only — restricts which address may claim the instance as first admin. Empty = anyone claims it. Not consulted after bootstrap; team members are added from `/admin/team` instead. |
| `RESEND_API_KEY` | no | Only used for lead-alert emails. Sign-in never needs it. Without it, alerts log a warning instead of sending and the app runs fine. |
| `RESEND_FROM_EMAIL` | no | Defaults to `DreamRue Lead Radar <onboarding@resend.dev>`. |
| `NODE_ENV` | no | `development` \| `test` \| `production`, defaults `development`. |

Validation is Zod-based and fails fast with a readable message
(`shared/config/env.ts::serverEnv()`) — if you add a new required secret, add it to the
schema there, not just to `.env.example`.

## First-time local setup

```bash
# 1. Postgres (any Postgres 14+; Neon and Supabase both work)
createdb dreamrue_dev

# 2. Configure
cp .env.example .env      # fill in DATABASE_URL, APIFY_API_TOKEN, and the secrets

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

To pull data immediately without waiting for the Vercel cron:

```bash
CRON=$(grep '^CRON_SECRET=' .env | cut -d= -f2)
curl -H "Authorization: Bearer $CRON" localhost:3000/api/cron/discover   # find datasets
curl -H "Authorization: Bearer $CRON" localhost:3000/api/cron/sync       # ingest + score
```

## Scheduled jobs

Declared in `vercel.json`: discovery every 15 minutes, sync every 5. This is the
*base* rate — per-dataset intervals adapt on top of it (faster after new items, backing
off when quiet, tightened on weekends Bali time). See
`domain/sync/scheduling.ts::nextIntervalSeconds`. When deploying somewhere other than
Vercel, replicate this cron schedule by hitting the same two GET routes with the bearer
secret.

## Third-party services

| Service | Used for | Configured via | Degrades gracefully? |
| --- | --- | --- | --- |
| Postgres | Everything — the only datastore | `DATABASE_URL` | No — hard requirement |
| Apify | Dataset discovery + item ingestion | `APIFY_API_TOKEN`, admin `sources` row | No — the only connector implemented today |
| Resend | Lead alert emails | `RESEND_API_KEY` (optional) | Yes — logs instead of sending |
| n8n | Upstream data producer (writes into Apify datasets) | Entirely external, not part of this repo | N/A |

There is no test/staging Apify token distinct from production configured anywhere in
this repo — be careful running `npm run db:seed` or triggering `/api/cron/sync` against
a real `APIFY_API_TOKEN` from a local machine, since it will actually pull and persist
live data into whatever `DATABASE_URL` you've pointed at.

## Local Postgres extension requirement

`npm run db:migrate` creates `pg_trgm` (used for `similarity()` in near-duplicate
detection and the `gin_trgm_ops` index on `leads.body`). If you're pointing at a managed
Postgres that restricts extension creation, `pg_trgm` needs to be enabled by the
provider first (Neon and Supabase both allow it out of the box; a locked-down RDS
instance might not).

## Commands reference

```bash
npm run dev          # dev server
npm run build        # production build
npm test              # vitest run
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run lint          # eslint
npm run db:generate  # create a migration from schema changes in infrastructure/db/schema
npm run db:migrate   # apply migrations (also creates pg_trgm)
npm run db:seed       # source, mapping profile, alert rules, aliases, FX — idempotent, safe to re-run
npm run db:studio    # drizzle studio
```
