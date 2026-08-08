# DreamRue n8n workflows

Exported, importable n8n workflow JSON. Nothing here is application code — this
directory is operational config for an external n8n instance. See the full
implementation plan artifact (linked from the PR/conversation that added this
directory) for the complete analysis behind these choices.

## Import order

1. `workflows/_shared-error-handler.json` first — every other workflow references
   it by name in `settings.errorWorkflow`. After importing, open each of the other
   9 workflows' **Settings → Error Workflow** and re-select **_Shared Error
   Handler** from the dropdown (n8n stores this by internal id, which is assigned
   at import time — the JSON's placeholder name won't resolve automatically).
2. `workflows/01` through `07` — the required scheduler workflows. One per
   existing `/api/trigger/*` route; no app changes needed for these.
3. `workflows/08-notification-delivery.json` and
   `workflows/09-weekly-report-render-and-send.json` — optional, only needed if
   you adopt the "move notification/report rendering to n8n" recommendation.
   Requires app-side changes — see the implementation plan's §3 code-change list
   before activating these two.

## After import, every workflow needs

- **Credentials** — every `REPLACE_WITH_YOUR_CREDENTIAL_ID` placeholder needs a
  real n8n credential selected from that node's Credential dropdown. Create these
  first (Settings → Credentials):
  - `DreamRue Trigger Secret` — type **Header Auth**, header name
    `x-webhook-secret`, value = the app's `N8N_TRIGGER_SECRET`.
  - `Resend API Bearer` — type **Header Auth**, header name `Authorization`,
    value `Bearer <RESEND_API_KEY>` (only needed for workflows 08/09).
  - `WhatsApp Cloud API Bearer` — type **Header Auth**, header name
    `Authorization`, value `Bearer <WHATSAPP_API_TOKEN>` (only needed for
    workflow 08).
- **Environment variables** (n8n instance-level, Settings → Environment or your
  deployment's env config):
  - `DREAMRUE_APP_URL` — e.g. `https://app.dreamrue.com`, no trailing slash.
  - `SLACK_ALERT_WEBHOOK_URL` — Slack incoming-webhook URL for the error handler
    and (optionally) workflow 08's Slack channel.
  - `DREAMRUE_NOTIFY_SHARED_SECRET` — only for workflows 08/09; must match a new
    app-side env var of the same name (see the implementation plan).
  - `DREAMRUE_NOTIFY_FROM_EMAIL` — only for workflows 08/09, e.g.
    `DreamRue Lead Radar <alerts@dreamrue.com>`.
  - `WHATSAPP_PHONE_NUMBER_ID` — only for workflow 08.
- **Activate** each workflow (top-right toggle) once credentials are wired —
  imported workflows are inactive by default.

## File layout

```
n8n/
├── README.md                  — this file
├── workflows/                 — 10 importable workflow exports
└── payloads/examples/         — every request/response body referenced by the
                                  workflows above, as standalone files for
                                  pasting into a node's "Send Test Request" or a
                                  Set node during local testing
```
