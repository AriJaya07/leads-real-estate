# AveronAi n8n workflows

Exported, importable n8n workflow JSON. Nothing here is application code — this
directory is operational config for an external n8n instance (self-hosted n8n is
free and open-source; that's the assumed deployment for this MVP — see
"Cost posture" below). See
[`docs/n8n-integration-plan.md`](../docs/n8n-integration-plan.md) for the full
analysis behind these choices — endpoint contracts, auth, retry/idempotency
posture, and the exact reasoning for every workflow below.

## File layout

```
n8n/
├── README.md                    — this file
├── workflows/
│   ├── _shared-error-handler.json     — import first; every other workflow's
│   │                                     Error Workflow points here
│   ├── triggers/                      — 01–07 + _trigger-caller sub-workflow
│   │   ├── _trigger-caller.json       — shared HTTP-call/retry/ok-branch logic
│   │   ├── 01-trigger-discover.json
│   │   ├── 02-trigger-sync.json
│   │   ├── 03-trigger-fx.json
│   │   ├── 04-trigger-retention.json
│   │   ├── 05-trigger-weekly-report.json
│   │   ├── 06-trigger-auto-assign.json
│   │   └── 07-trigger-reminders.json
│   ├── outbound/
│   │   └── 10-outbound-lead-events.json   — app push → Slack / WhatsApp / Sheets
│   ├── exports/
│   │   └── 11-leads-export-sync.json      — poll app → Google Sheets
│   └── notifications/
│       ├── 08-notification-delivery.json          — whatsapp/slack delivery relay
│       └── 09-weekly-report-render-and-send.json   — weekly digest render+send
└── payloads/examples/            — every request/response body referenced by the
                                     workflows above, as standalone files for
                                     pasting into a node's "Send Test Request" or a
                                     Set node during local testing
```

Each subfolder groups workflows by role, not by number, so "what does this
directory do" is answerable without opening every file: `triggers/` pokes the
app on a schedule, `outbound/` reacts to app push events, `exports/` polls the
app for a spreadsheet, `notifications/` does the actual sending for channels
the app hands off.

## Cost posture (MVP)

Every destination wired into these workflows is free or has a generous free
tier — deliberately, so this costs nothing beyond hosting n8n itself:

- **n8n**: self-hosted (open-source, MIT-ish fair-code license, no
  per-execution cost — only your server bill). If you're on n8n Cloud instead,
  its free tier's execution cap may bind faster than these cadences assume;
  budget for that separately.
- **Google Sheets**: free with any Google account, used as the "CRM" for both
  the export sync (workflow 11) and the alert-delivery audit log (workflow 10).
- **Slack**: a free Incoming Webhook needs no paid Slack plan.
- **WhatsApp Cloud API**: Meta's free monthly conversation allowance covers
  low-volume alerting; costs only appear past that allowance.
- **Resend**: free tier covers low-volume transactional email (invites,
  password resets, lead-alert emails) — this stays in the app, unaffected by
  any of the above.

No CRM (Zoho/HubSpot/etc.) is wired in for MVP — Google Sheets covers "a place
the sales team can see and filter leads" at zero cost; add a real CRM later if
volume outgrows a spreadsheet.

## Import order

1. `workflows/_shared-error-handler.json` — every other workflow references it
   by name in `settings.errorWorkflow`. After importing, open each of the other
   workflows' **Settings → Error Workflow** and re-select **_Shared Error
   Handler** from the dropdown (n8n stores this by internal id, assigned at
   import time — the JSON's placeholder name won't resolve automatically).
2. `workflows/triggers/_trigger-caller.json` — the shared sub-workflow every
   `0X-trigger-*.json` calls. Import this before the 7 trigger workflows.
3. `workflows/triggers/01` through `07` — the scheduler workflows, one per
   `/api/trigger/*` route; no app changes needed. After importing each, open
   its **Execute Workflow** node and re-select `_Trigger Caller` from the
   workflow dropdown (same id-not-name caveat as the error handler).
4. `workflows/outbound/10-outbound-lead-events.json` and
   `workflows/exports/11-leads-export-sync.json` — no app changes needed. 10
   receives the app's already-built outbound webhook (enable it at
   `/admin/automation`); 11 polls the already-built `GET /api/v1/leads` (issue
   a key at `/admin/api-keys`). Both are safe to import and activate any time.
5. `workflows/notifications/08-notification-delivery.json` and
   `workflows/notifications/09-weekly-report-render-and-send.json` — these
   **do** need app-side code, and it's already in this repo: the `whatsapp`
   and `slack` notifier channels relay through 08
   (`infrastructure/notifiers/n8n.notifier.ts`,
   `infrastructure/notifiers/registry.ts`), and the weekly report posts raw
   stats to 09 (`application/automation/send-weekly-report.ts`). The `email`
   channel deliberately does **not** go through n8n — see "Why email stays
   direct" below.

## Why email stays direct

`email` is the one notifier channel shared with password-reset and
team-invite sends (`application/auth/password-reset.actions.ts`,
`application/auth/invite.actions.ts`), not just lead alerts. Routing it
through an external automation tool would make "can a user reset their
password" depend on n8n being reachable and correctly configured — an
unacceptable regression for an MVP that needs auth to just work. `whatsapp`
and `slack` have no such dependency (alert-only, and `whatsapp` previously
had no working credential wired up anyway), so those are the two channels
that moved.

## After import, every workflow needs

- **Credentials** — every `REPLACE_WITH_YOUR_CREDENTIAL_ID` placeholder needs a
  real n8n credential selected from that node's Credential dropdown. Create these
  first (Settings → Credentials):
  - `AveronAi Trigger Secret` — type **Header Auth**, header name
    `x-webhook-secret`, value = the app's `N8N_TRIGGER_SECRET`. Used by
    `_Trigger Caller` (and therefore workflows 01–07).
  - `AveronAi API Key (Leads Export)` — type **Header Auth**, header name
    `Authorization`, value `Bearer drk_live_...` (issued at `/admin/api-keys`).
    Used by workflow 11 only.
  - `AveronAi Google Sheets` — type **Google Sheets OAuth2 API**, any Google
    account with edit access to the spreadsheet at
    `AVERONAI_SHEETS_SPREADSHEET_ID`. Used by workflows 10 and 11.
  - `WhatsApp Cloud API Bearer` — type **Header Auth**, header name
    `Authorization`, value `Bearer <WHATSAPP_API_TOKEN>`. Used by workflows 08
    and 10 (the ops-notify branch).
  - `Resend API Bearer` — type **Header Auth**, header name `Authorization`,
    value `Bearer <RESEND_API_KEY>`. Used by workflow 09 only (the weekly
    report render+send).
- **Environment variables** (n8n instance-level, Settings → Environment or your
  deployment's env config):
  - `AVERONAI_APP_URL` — e.g. `https://app.averonai.com`, no trailing slash.
    Used by `_Trigger Caller` and workflow 11.
  - `SLACK_ALERT_WEBHOOK_URL` — Slack incoming-webhook URL for the shared error
    handler (system/execution failures).
  - `SLACK_LEAD_ALERTS_WEBHOOK_URL` — a **separate** Slack incoming-webhook URL
    for workflow 10's real-time hot-lead pings, deliberately not shared with
    the error handler's channel so business alerts don't drown in error noise.
  - `AVERONAI_WEBHOOK_SHARED_SECRET` — workflow 10 only. Must match the signing
    secret the app generates when you enable the webhook at
    `/admin/automation` (`automation_settings.webhookSecret`).
  - `AVERONAI_SHEETS_SPREADSHEET_ID` — the Google Sheet used by workflows 10
    and 11. One spreadsheet, two tabs: **"Leads Export"** (workflow 11) and
    **"Alert Deliveries"** (workflow 10's audit log) — create both tabs with a
    header row matching each workflow's `templateNote` before first run.
  - `WHATSAPP_PHONE_NUMBER_ID` — the WhatsApp Cloud API sender's phone number
    id. Used by workflows 08 and 10.
  - `WHATSAPP_OPS_PHONE_NUMBER` — the phone number that receives workflow 10's
    "alert delivered" oversight copy (a supervisor/ops number, distinct from
    whoever the original alert went to — see that workflow's `templateNote`
    for why).
  - `AVERONAI_NOTIFY_SHARED_SECRET` — workflows 08 and 09. Must match the
    app's `AVERONAI_NOTIFY_SHARED_SECRET` env var.
  - `AVERONAI_NOTIFY_FROM_EMAIL` — workflow 09 only.
- **Activate** each workflow (top-right toggle) once credentials are wired —
  imported workflows are inactive by default.
