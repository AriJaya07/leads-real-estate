# Deployment Guide

How to take AveronAi from a clean checkout to a running production instance. This is
the step-by-step runbook; see [environment.md](environment.md) for the full reference
on every environment variable and third-party service, and
[production-checklist.md](production-checklist.md) for what to verify before calling
a deploy launch-ready.

AveronAi is a standard Next.js 16 App Router app with Cache Components enabled, a
single Postgres database, and no other required infrastructure (no Redis, no queue,
no separate worker process). It runs on any Node 22-compatible host that supports
Next.js — deployed here with Vercel in mind (the codebase's own comments reference
"Vercel's logs," and the removed `vercel.json` cron config in git history), but nothing
in the app is Vercel-specific beyond that.

## 1. Provision Postgres

Any Postgres 14+ works; Neon and Supabase are both confirmed working by the team that
built this. You need:

- One database for production.
- The ability to create extensions (`pg_trgm` is required — used for near-duplicate
  detection and trigram search indexes). Neon and Supabase both allow this by default;
  a locked-down self-hosted/RDS instance might not — confirm before committing to a host.

Get the connection string ready as `DATABASE_URL`.

## 2. Set environment variables

On your hosting platform, set every variable in the **Required** table in
[environment.md](environment.md):

- `DATABASE_URL`
- `APIFY_API_TOKEN`
- `APIFY_WEBHOOK_SECRET` (generate with `openssl rand -hex 32` or similar — 16+ chars, treat like a password)
- `AUTH_SECRET` (32+ chars — `openssl rand -hex 32`; **rotating this later signs every existing user out**, so generate it once, carefully, and store it in your secrets manager, not just the hosting platform's env UI)
- `APP_URL` — the real production URL (used to build links in emails and the Apify webhook callback URL)
- `NODE_ENV=production`

And decide on each optional one deliberately (all degrade gracefully if left unset —
see environment.md's "Third-party services" table for exactly what "degrades" means
for each):

- `AUTH_ALLOWED_EMAILS` — **set this for the production bootstrap**, to whichever
  email(s) should be allowed to create the very first account. Leaving it unset means
  literally anyone who reaches `/signup` first claims the instance. Not consulted
  after the first company exists.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — needed for invite emails, password-reset
  emails, and lead-alert emails to actually send. Without it, all three log a warning
  and drop the message — the app still functions (invite links can be copied manually
  from the admin screen), but real customers need this.
- `N8N_TRIGGER_SECRET` — needed once you set up the scheduled trigger workflow (§6).
  Leave unset and every `/api/trigger/*` route safely 401s everyone.
- `N8N_NOTIFY_WEBHOOK_URL` / `N8N_WEEKLY_REPORT_WEBHOOK_URL` / `AVERONAI_NOTIFY_SHARED_SECRET`
  — only if you're using WhatsApp/Slack alert channels or the weekly report; both
  channels and the report render/send in n8n now (`n8n/workflows/notifications/`), not
  the app. Without these, WhatsApp/Slack alerts and the weekly digest log a warning and
  don't send — email alerts are unaffected, they still go direct via `RESEND_API_KEY`.
- `ANTHROPIC_API_KEY` / `LLM_SHADOW_CLASSIFY_ENABLED` — optional shadow-mode
  classifier comparison logging; not required for launch.

Never commit real values for any of these — `.env`/`.env.test`/`.env.e2e` are gitignored
and never checked into the repo.

## 3. Run migrations

From a machine with the production `DATABASE_URL` available (or via your platform's
release/build-step hook):

```bash
npm run db:migrate:ci
```

(`db:migrate:ci` reads `DATABASE_URL` straight from the environment rather than an
`.env` file — the right one for a deploy pipeline. `db:migrate` is the equivalent for
local use against a `.env` file.) This also creates the `pg_trgm` extension if it
doesn't already exist.

**Do not run `npm run db:seed` against production.** Seeding creates the default
mapping profile, alert rule template, and location aliases — safe and idempotent for a
fresh dev database, but not something to run blindly against real customer data
without reading `infrastructure/db/seed.mjs` first to confirm what it does in your
specific case.

## 4. Build and deploy

```bash
npm run build
npm run start   # or however your platform serves a Next.js production build
```

On Vercel specifically: connect the repo, set the environment variables from step 2
in the project settings, and it builds/deploys on push to `main` automatically — no
extra configuration needed beyond the env vars. Cache Components / Partial
Prerendering (`next.config.ts`'s `cacheComponents: true`) works out of the box on
Vercel; if deploying elsewhere, confirm your host's Next.js adapter supports it.

## 5. Configure the Apify webhook

Data collected by Apify actor runs is delivered back to AveronAi via a webhook.

1. In your Apify account, no manual webhook setup is required for *triggered* scrape
   requests — `application/collection/start-scrape-request.ts` registers the webhook
   per-run automatically, pointed at `${APP_URL}/api/webhooks/apify`, using
   `APIFY_WEBHOOK_SECRET`.
2. For the *background sync* path (n8n pushing into named Apify datasets, not running
   an actor), you separately need an Apify Console-level webhook (Actor run
   succeeded/failed) pointed at the same URL, if you're using that ingestion path —
   see `docs/architecture.md`'s "Key design decisions" section for why this path exists
   independently of the triggered-run path.
3. Verify: trigger a real scrape request from **Admin → Collect data** after deploy and
   confirm it reaches `succeeded` status and produces a lead.

## 6. Set up scheduled jobs (n8n)

This is the biggest deploy-time gap to close — see
[production-checklist.md](production-checklist.md) §7. Four routes need an external
scheduler to call them; nothing in this repo does it for you:

| Route | Suggested cadence |
| --- | --- |
| `POST /api/trigger/discover` | every 15 min |
| `POST /api/trigger/sync` | every 5 min |
| `POST /api/trigger/fx` | daily |
| `POST /api/trigger/retention` | weekly |

Each needs `N8N_TRIGGER_SECRET` sent as either an `x-webhook-secret` header or
`Authorization: Bearer <secret>`. Set up an n8n (or any scheduler — cron-as-a-service,
GitHub Actions on a schedule, your host's own cron product) workflow that calls each on
its cadence and alerts on a non-2xx response. Full detail on what each route does and
why the cadence matters: [environment.md](environment.md)'s "Scheduled jobs" section.

**Until this is configured**, the background-sync ingestion path only advances via the
Apify webhook (real-time, but only for datasets Apify itself notifies about) or a
manual "Sync" click in **Admin → Datasets**. The on-demand scrape-request path
(**Admin → Collect data**) works independently of this and needs no scheduler.

## 7. First-login bootstrap

1. Visit `/signup` with the email you set in `AUTH_ALLOWED_EMAILS`.
2. This creates the first company, with you as its `owner`, on a 14-day trialing
   Starter subscription.
3. From **Admin → Team**, invite the rest of your team.
4. From **Admin → Datasets** (background sync) or **Admin → Collect data** (on-demand),
   connect your first real data source.

## 8. Post-deploy smoke test

Before calling it done:

- [ ] Sign up, sign in, sign out.
- [ ] Invite a teammate, have them accept and sign in.
- [ ] Trigger a manual sync (or a scrape request) and confirm a lead appears in the
      dashboard within a few minutes.
- [ ] Open a lead's detail sheet, change its status, add a note.
- [ ] Check **Admin → Billing** shows the correct plan and usage numbers.
- [ ] Confirm the health-check-worthy pages load: `/leads`, `/pipeline`,
      `/intelligence`, `/admin/sync`.
- [ ] Confirm error pages render correctly for a deliberately-broken request (e.g. a
      nonexistent lead id) — should show the app's branded error state, not a raw stack trace.

## Rolling back

There's no automated rollback tooling in this repo. If a deploy needs to be reverted:

1. Redeploy the previous known-good commit/build on your hosting platform.
2. **Check whether the bad deploy included a migration** before rolling back the app —
   rolling back code while a newer migration has already run against production can
   leave the schema ahead of what the older code expects. If a migration did run,
   write and apply a compensating migration rather than trying to "undo" the schema
   change; this repo's migration history is intentionally linear and forward-only (see
   `docs/tech-debt.md`'s note on the one time migration history was collapsed —
   don't repeat that against a database with real customer data in it).
