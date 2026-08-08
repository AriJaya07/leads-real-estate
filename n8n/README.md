# DreamRue n8n workflows

Exported, importable n8n workflow JSON. Nothing here is application code — this
directory is operational config for an external n8n instance. See
[`docs/n8n-integration-plan.md`](../docs/n8n-integration-plan.md) for the full
analysis behind these choices — endpoint contracts, auth, retry/idempotency
posture, and the exact reasoning for every workflow below.

## Import order

1. `workflows/_shared-error-handler.json` first — every other workflow references
   it by name in `settings.errorWorkflow`. After importing, open each of the other
   10 workflows' **Settings → Error Workflow** and re-select **_Shared Error
   Handler** from the dropdown (n8n stores this by internal id, which is assigned
   at import time — the JSON's placeholder name won't resolve automatically).
2. `workflows/01` through `07` — the required scheduler workflows. One per
   existing `/api/trigger/*` route; no app changes needed for these.
3. `workflows/10-outbound-lead-events.json` and
   `workflows/11-leads-export-sync.json` — recommended, no app changes needed.
   10 receives the app's already-built outbound webhook (enable it at
   `/admin/automation`); 11 polls the already-built `GET /api/v1/leads` (issue a
   key at `/admin/api-keys`). Both are pure additions on top of what's already
   shipped — safe to import and activate any time.
4. `workflows/08-notification-delivery.json` and
   `workflows/09-weekly-report-render-and-send.json` — **optional, and not yet
   wired up on the app side.** These assume a "move notification/report
   rendering into n8n" architecture that requires new app code that doesn't
   exist yet: a `n8n.notifier.ts` adapter implementing the app's `Notifier`
   port, a new `DREAMRUE_NOTIFY_SHARED_SECRET` env var, and
   `application/automation/send-weekly-report.ts` changed to POST to workflow 09
   instead of rendering the email itself. Import them if you want, but leave
   them inactive until that app-side work is done — see
   `docs/n8n-integration-plan.md` §8 for the exact change list, and confirm with
   whoever owns the app repo before starting it; it's a real architecture
   decision (where does rendering/sending live), not a small tweak.

## After import, every workflow needs

- **Credentials** — every `REPLACE_WITH_YOUR_CREDENTIAL_ID` placeholder needs a
  real n8n credential selected from that node's Credential dropdown. Create these
  first (Settings → Credentials):
  - `DreamRue Trigger Secret` — type **Header Auth**, header name
    `x-webhook-secret`, value = the app's `N8N_TRIGGER_SECRET`. Used by
    workflows 01–07.
  - `DreamRue API Key (Leads Export)` — type **Header Auth**, header name
    `Authorization`, value `Bearer drk_live_...` (issued at `/admin/api-keys`).
    Used by workflow 11 only.
  - `Resend API Bearer` — type **Header Auth**, header name `Authorization`,
    value `Bearer <RESEND_API_KEY>` (only needed for workflows 08/09, not yet
    wired up — see Import order above).
  - `WhatsApp Cloud API Bearer` — type **Header Auth**, header name
    `Authorization`, value `Bearer <WHATSAPP_API_TOKEN>` (only needed for
    workflow 08, not yet wired up).
- **Environment variables** (n8n instance-level, Settings → Environment or your
  deployment's env config):
  - `DREAMRUE_APP_URL` — e.g. `https://app.dreamrue.com`, no trailing slash.
    Used by workflows 01–07 and 11.
  - `SLACK_ALERT_WEBHOOK_URL` — Slack incoming-webhook URL for the error handler
    and (optionally) workflow 08's Slack channel.
  - `DREAMRUE_WEBHOOK_SHARED_SECRET` — workflow 10 only. Must match the signing
    secret the app generates when you enable the webhook at
    `/admin/automation` (`automation_settings.webhookSecret`) — copy it in
    after enabling, it's shown in the admin UI.
  - `DREAMRUE_NOTIFY_SHARED_SECRET` — only for workflows 08/09 (not yet wired
    up); would need to match a new app-side env var of the same name.
  - `DREAMRUE_NOTIFY_FROM_EMAIL` — only for workflows 08/09 (not yet wired up).
  - `WHATSAPP_PHONE_NUMBER_ID` — only for workflow 08 (not yet wired up).
- **Activate** each workflow (top-right toggle) once credentials are wired —
  imported workflows are inactive by default.

## File layout

```
n8n/
├── README.md                  — this file
├── workflows/                 — 11 importable workflow exports + shared error handler
└── payloads/examples/         — every request/response body referenced by the
                                  workflows above, as standalone files for
                                  pasting into a node's "Send Test Request" or a
                                  Set node during local testing
```
