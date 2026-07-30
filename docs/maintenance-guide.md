# Maintenance Guide

Ongoing operational care and feeding for a running DreamRue instance. Deployment
itself is covered in [deployment-guide.md](deployment-guide.md); this is what happens
after launch.

## Daily / continuous

**Nothing requires daily manual attention if the scheduled jobs (deployment-guide.md
§6) are configured correctly.** The things to have alerting on instead:

- **The four `/api/trigger/*` routes returning non-2xx.** Whatever calls them on a
  schedule (n8n or otherwise) should alert on failure — a silent failure here means
  data stops flowing with no visible symptom until someone notices the dashboard looks
  stale.
- **Apify webhook failures.** Check `api_requests` table (or your log aggregator) for
  a spike in non-2xx responses from Apify calls — usually means the `APIFY_API_TOKEN`
  expired/was revoked, or Apify's own service is degraded.
- **Sign-in failures spiking.** A sudden spike in `login_attempts` failures for one
  email is expected (someone forgot their password); a spike across *many* different
  emails from the same pattern is worth a look — the lockout (fixed to be race-free
  this pass) will contain it automatically, but it's still worth knowing about.

## Weekly

- **Review `/admin/sync` across your customers** (or build a platform-wide equivalent —
  today it's per-company only, see production-checklist.md §8) — datasets stuck in
  `degraded`/`error`/`schema_drift` health need a human to look, especially schema
  drift: it means an upstream source changed shape and the mapping profile needs
  re-review before that dataset's data can be trusted again.
- **Check `docs/tech-debt.md` for anything time-sensitive.** It's a living document;
  skim it after any week where you touched sync, billing, or auth code.
- **Confirm the retention job (`POST /api/trigger/retention`) actually ran** — it prunes
  `sync_events` (30-day retention) and `login_attempts` (7-day retention). If it's been
  silently failing, these tables grow unbounded.

## Monthly

- **Review usage vs. plan limits across customers** (`/admin/billing` per company, or
  a direct query against `usage_counters`) — both for your own visibility into who's
  close to a plan ceiling (upsell signal) and to sanity-check the atomic budget
  reservation added this pass is behaving as expected (Apify request counts should
  track real Apify usage closely, with a small, expected over-count — see the comment
  on `incrementApifyRequestUsage` in `application/billing/usage.ts` for why).
- **Rotate `APIFY_WEBHOOK_SECRET` and `N8N_TRIGGER_SECRET`** if your security policy
  requires periodic rotation — both are plain shared secrets checked via
  `application/http/verify-secret.ts`, safe to rotate any time (update the env var,
  redeploy; no data migration needed). **Do not rotate `AUTH_SECRET` casually** — it
  signs every session JWT, so rotating it signs every signed-in user out immediately.
- **Dependency updates.** `npm outdated`, review, update. Pay particular attention to
  `next` given this fork's documented breaking-changes posture (AGENTS.md) — read the
  bundled `node_modules/next/dist/docs/` for the target version before bumping major
  versions, the same rule that applies to writing new code against it.

## As-needed

### A customer reports missing/wrong leads

1. Check that customer's `/admin/sync` — is the relevant dataset healthy?
2. Check `sync_events` for that dataset's recent runs (`getSyncEvents` /
   the admin sync-run detail page) for warnings/errors.
3. If the mapping profile is the suspect (data present in `raw_records` but not
   showing up as leads correctly), remember: **everything downstream of `raw_records`
   is fully derived and re-runnable.** Fixing a mapping profile and re-triggering a
   sync re-derives every appearance from the untouched raw data — no need to re-scrape.

### A customer's data looks like it's mixing with another customer's

Treat as a P0 security incident, not a routine bug. Given the multi-tenant isolation
model is app-layer (audited, not DB-enforced — production-checklist.md §2), the fix is
almost certainly a missing `companyId` filter in a specific query. Do not attempt a
quick patch without writing a regression test in the shape of `e2e/multi-tenant.spec.ts`
first, to prove the fix actually closes the specific leak before considering it resolved.

### Rotating a compromised secret

- **`AUTH_SECRET`**: rotate immediately if compromised, accepting that every user gets
  signed out. Communicate proactively if possible.
- **`APIFY_API_TOKEN`**: rotate in the Apify console, update the env var, redeploy. No
  user-facing impact; in-flight scrape requests started with the old token will still
  complete (Apify doesn't revoke in-flight runs), new ones use the new token.
- **`DATABASE_URL` credentials**: coordinate with your Postgres provider's credential
  rotation flow; this always needs a deploy to pick up the new connection string.

### Scaling beyond current assumptions

The app currently assumes (documented, not hardcoded, so these are review points, not
hard walls):

- **A handful to tens of thousands of leads per company.** The unindexed
  `locations`/`propertyTypes` array search (docs/tech-debt.md) is the first thing to
  revisit if search feels slow at higher volumes.
- **A small connection pool** (`infrastructure/db/client.ts`, `max: 10`). If deploying
  to a serverless platform with many concurrent function instances, check whether
  you're exhausting Postgres's own max-connections limit — consider a connection
  pooler (PgBouncer, or your Postgres provider's built-in pooling — Neon and Supabase
  both offer one) if so.
- **Single-region, single-instance Postgres.** No read replica, no multi-region setup.
  Fine until either latency-to-database or write throughput becomes a measured problem,
  not before.

## Backups

This repo does not manage backups itself — that's your Postgres provider's job. Before
launch, confirm (don't assume):

- [ ] Automated daily backups are enabled on your production Postgres instance.
- [ ] You know the actual restore procedure for your provider (Neon/Supabase both have
      point-in-time recovery — know how to invoke it *before* you need it).
- [ ] Backup retention window matches your data-retention/compliance needs.

## Useful queries for support/debugging

```sql
-- A company's current plan and usage at a glance
select p.name, s.status, uc.metric, uc.value
from subscriptions s
join plans p on p.id = s.plan_id
left join usage_counters uc on uc.company_id = s.company_id
where s.company_id = '<company-id>';

-- Recent failed sync runs across the whole platform
select company_id, dataset_id, status, error_summary, started_at
from sync_runs
where status = 'failed'
order by started_at desc
limit 50;

-- Recent failed scrape requests
select company_id, template_name, status, error_summary, requested_at
from scrape_requests
where status in ('failed', 'timed_out', 'aborted')
order by requested_at desc
limit 50;
```

Run these read-only, against a replica if you have one — this repo has no admin query
console built in, so direct SQL access is the only way to answer some support
questions today.
