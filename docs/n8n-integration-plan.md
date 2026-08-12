# n8n Integration Plan

The analysis behind `n8n/workflows/*` — why each workflow exists, what it
assumes about the app, and the endpoint contracts it depends on. `n8n/README.md`
covers *how* to import/configure; this doc covers *why* it's shaped this way.

## Why n8n, and what it owns

This app deliberately has no built-in scheduler (`docs/tech-debt.md`'s "no
cron job" entry) and treats "which datasets sync, how often, who gets
alerted" as database state edited from `/admin`, never an env var
(`agent-rules.md`'s hard constraints). n8n is the piece that turns that
DB-driven configuration into actual scheduled HTTP calls — it owns *when*
things run, the app owns *what* counts as due/matched/hot.

Three integration shapes exist between the app and n8n, matching the three
workflow subfolders:

1. **`triggers/`** — n8n calls the app on a schedule. The app does the work
   synchronously and returns `{ ok, ... }`; n8n's only job is retry + alert on
   a bad response.
2. **`outbound/`** — the app calls n8n (an HMAC-signed webhook) the moment
   something happens. n8n's job is routing to the right destination.
3. **`exports/` and `notifications/`** — n8n calls the app (a poll) or the app
   calls n8n (a relay). Same shapes as above, reused for read-side and
   delivery-side integrations respectively.

## `triggers/` — scheduled ticks

Seven `POST /api/trigger/*` routes exist, each guarded by `N8N_TRIGGER_SECRET`
(`application/http/verify-secret.ts::secretsMatch`, constant-time). Every
route is idempotent and safe to over-call — a missed or doubled tick costs at
most one cycle, never correctness — which is what makes "just point a
scheduler at it" a safe integration instead of something requiring exactly-
once delivery guarantees.

`01`–`07` used to be seven independent copies of the same five nodes
(schedule trigger → HTTP call → ok/fail branch), differing only in cron
expression, route, and timeout. Collapsed into a shared `_trigger-caller`
sub-workflow: one place owns the credential, retry policy (3 tries, 3s
backoff), and timeout handling, and each of the seven callers is two nodes
(its own schedule + an Execute Workflow call passing `{ route, timeoutMs }`).
Changing the retry count or adding a new header now means editing one
workflow, not seven.

`02-trigger-sync` is the one exception to the default 60s HTTP timeout — it
passes `timeoutMs: 300000` because the route's `maxDuration = 300` server-side
(processing up to 10 due datasets per tick).

See `docs/environment.md`'s "Scheduled jobs" table for the full route list,
functions, and suggested cadences.

## `outbound/` — push events

Workflow 10 receives four event types on one webhook URL, HMAC-verified
(`infrastructure/webhooks/outbound-webhook.ts::signWebhookBody`) against the
raw request body — verifying against a re-serialized JS object would silently
break on key-order/number-formatting differences, so the Verify HMAC node
requires the Webhook node's Raw Body option.

The four events carry **two different payload shapes**, not one:

- `lead.created_or_updated` / `lead.status_changed`: `data` is a bare
  `Lead[]` array — every lead touched, unfiltered.
- `lead.matched` / `alert.fired`: `data` is
  `{ ruleId, ruleName, [channel, recipient,] leads: Lead[] }` — already
  filtered by an `/admin`-configured alert rule's predicate
  (`domain/alerting/predicate.ts`).

That distinction drives the branch design: `lead.matched` (a rule just
matched, before delivery) goes to a real-time Slack ping with **no
additional filtering in n8n** — the DB predicate already did the filtering,
and re-filtering by a hardcoded score in the workflow would create a second,
driftable source of truth for "what counts as hot." `alert.fired` (delivery
already succeeded) goes to a WhatsApp copy to an ops number — deliberately
*not* the original recipient, since that person already got the alert
in-app and a second WhatsApp ping would be a duplicate, not a confirmation —
plus an append-only Google Sheets audit row.

`lead.created_or_updated` and `lead.status_changed` are left as stubs on
purpose: wiring every single lead touch to Slack/Sheets/WhatsApp would flood
those channels and duplicate what workflow 11 already covers via polling.
Extend them only when a concrete use case shows up.

## `exports/` — poll-based read side

Workflow 11 is the counterpart for a consumer that only knows how to poll —
pulls `status=new` leads created since the last successful run via
`GET /api/v1/leads` (API-key authenticated, same `LeadFilters` shape the
in-app inbox uses) and upserts them into a Google Sheet, matched on `id`.

The pagination and incremental-cursor logic live in one Code node rather than
a chain of IF/SplitInBatches nodes — a `do { ... } while (page <= totalPages)`
loop that persists `lastRunAt` in the node's workflow static data. Captured
*before* fetching (not after), so a lead created mid-run is picked up next
tick rather than silently skipped, and upsert-by-id makes a re-pulled page
safe even after a mid-pagination failure.

Known tradeoff: `status=new` means a lead permanently drops off this export
once its status changes, even if it later reverts to `new`. Fine for "a sheet
of fresh leads to work," revisit if that stops being true.

## `notifications/` — delivery relay + weekly report

These are the two workflows that needed app-side code, and only for two of
the app's notifier channels:

- **`08-notification-delivery`**: `whatsapp` and `slack` channels relay here
  (`infrastructure/notifiers/n8n.notifier.ts`) — the app still decides
  who/when/what (dedup via `alert_deliveries`, throttle, rule matching,
  message rendering via `application/alerting/digest-template.ts`), n8n only
  does the physical send. **`email` deliberately stays out of this
  workflow** — it's shared with password-reset and team-invite sends
  (`application/auth/password-reset.actions.ts`,
  `application/auth/invite.actions.ts`), which must not depend on n8n being
  reachable. See `n8n/README.md`'s "Why email stays direct."
- **`09-weekly-report-render-and-send`**: the one place rendering itself
  moved into n8n, not just delivery. `application/automation/send-weekly-report.ts`
  computes the numbers (same `getLeadStats`/`getLeadTrend`/`getRevenueSummary`/
  `getConversionFunnel`/`getTopUncontactedLeads` the dashboard uses) and posts
  them raw, once per recipient; the workflow's Code node builds the HTML/text
  and a second node sends via Resend. This is safe to move (unlike `email` in
  general) because `sendWeeklyReport` is its own isolated call path — nothing
  else shares it.

Both require the same `AVERONAI_NOTIFY_SHARED_SECRET`, checked against the
`x-averonai-notify-secret` header by each workflow's own Verify Shared Secret
node.

## What's deliberately not here

- **No CRM integration.** Google Sheets covers "somewhere the sales team can
  see and filter leads" at zero cost for an MVP; see `n8n/README.md`'s "Cost
  posture."
- **No app-side fallback when an n8n webhook URL is unset.** Every relay
  (`n8n.notifier.ts`, `postWeeklyReport`) degrades to a logged warning and
  `ok: false`, the same posture every other notifier in this codebase already
  has — never a silent retry loop, never a crash.
