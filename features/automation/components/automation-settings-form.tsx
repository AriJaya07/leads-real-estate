"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { regenerateWebhookSecret, updateAutomationSettings } from "@/application/automation/automation-settings.actions";
import type { AutomationSettingsRow } from "@/infrastructure/db/schema/automation";

function csv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function AutomationSettingsForm({ settings }: { settings: AutomationSettingsRow }) {
  const { busyId, run } = useServerAction();
  const saving = busyId === "save";

  const [autoAssignEnabled, setAutoAssignEnabled] = useState(settings.autoAssignEnabled);
  const [reminderEnabled, setReminderEnabled] = useState(settings.reminderEnabled);
  const [reminderStaleDays, setReminderStaleDays] = useState(String(settings.reminderStaleDays));
  const [reminderRecipients, setReminderRecipients] = useState(settings.reminderRecipients.join(", "));
  const [weeklyReportEnabled, setWeeklyReportEnabled] = useState(settings.weeklyReportEnabled);
  const [weeklyReportRecipients, setWeeklyReportRecipients] = useState(settings.weeklyReportRecipients.join(", "));
  const [webhookEnabled, setWebhookEnabled] = useState(settings.webhookEnabled);
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl ?? "");
  const [webhookSecret, setWebhookSecret] = useState(settings.webhookSecret);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      "save",
      () =>
        updateAutomationSettings({
          autoAssignEnabled,
          reminderEnabled,
          reminderStaleDays: Number(reminderStaleDays) || 1,
          reminderRecipients: csv(reminderRecipients),
          weeklyReportEnabled,
          weeklyReportRecipients: csv(weeklyReportRecipients),
          webhookEnabled,
          webhookUrl: webhookUrl.trim() || undefined,
        }),
      {
        errorFallback: "Could not save automation settings",
        onSuccess: () => toast.success("Automation settings saved"),
      },
    );
  }

  async function regenerateSecret() {
    await run("secret", () => regenerateWebhookSecret(), {
      errorFallback: "Could not generate a new secret",
      onSuccess: (result) => {
        setWebhookSecret(result.secret);
        toast.success("New webhook secret generated — update your receiver");
      },
    });
  }

  async function copySecret() {
    if (!webhookSecret) return;
    await navigator.clipboard.writeText(webhookSecret);
    toast.success("Copied");
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <section className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={autoAssignEnabled}
            onChange={(event) => setAutoAssignEnabled(event.target.checked)}
            className="border-input mt-0.5 size-4 rounded"
          />
          <span>
            <span className="font-medium">Automatic lead assignment</span>
            <p className="text-muted-foreground text-sm">
              Newly-unassigned leads are round-robin assigned across your current team, weighted toward whoever
              currently has the lightest active-pipeline workload.
            </p>
          </span>
        </label>
      </section>

      <section className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={reminderEnabled}
            onChange={(event) => setReminderEnabled(event.target.checked)}
            className="border-input mt-0.5 size-4 rounded"
          />
          <span>
            <span className="font-medium">Stale lead reminders</span>
            <p className="text-muted-foreground text-sm">
              An email digest of leads sitting in an active status (contacted, qualified, interested,
              negotiation) with no update for a while — the ones that started, then went quiet.
            </p>
          </span>
        </label>
        {reminderEnabled && (
          <div className="flex flex-col gap-3 pl-6 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-days">Remind after (days inactive)</Label>
              <Input
                id="reminder-days"
                type="number"
                min={1}
                max={90}
                value={reminderStaleDays}
                onChange={(event) => setReminderStaleDays(event.target.value)}
                className="w-24"
              />
            </div>
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor="reminder-recipients">Recipients (comma-separated)</Label>
              <Input
                id="reminder-recipients"
                value={reminderRecipients}
                onChange={(event) => setReminderRecipients(event.target.value)}
                placeholder="manager@company.com"
              />
            </div>
          </div>
        )}
      </section>

      <section className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={weeklyReportEnabled}
            onChange={(event) => setWeeklyReportEnabled(event.target.checked)}
            className="border-input mt-0.5 size-4 rounded"
          />
          <span>
            <span className="font-medium">Weekly performance report</span>
            <p className="text-muted-foreground text-sm">
              A weekly email summary — new leads, buyers, unassigned count, and median time to first touch.
            </p>
          </span>
        </label>
        {weeklyReportEnabled && (
          <div className="flex flex-col gap-1.5 pl-6">
            <Label htmlFor="report-recipients">Recipients (comma-separated)</Label>
            <Input
              id="report-recipients"
              value={weeklyReportRecipients}
              onChange={(event) => setWeeklyReportRecipients(event.target.value)}
              placeholder="owner@company.com"
              className="max-w-sm"
            />
          </div>
        )}
      </section>

      <section className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={webhookEnabled}
            onChange={(event) => setWebhookEnabled(event.target.checked)}
            className="border-input mt-0.5 size-4 rounded"
          />
          <span>
            <span className="font-medium">Outbound webhook</span>
            <p className="text-muted-foreground text-sm">
              POSTs a JSON payload when a lead is created/updated or its status changes — the integration point
              for a CRM, Zapier, or Make.
            </p>
          </span>
        </label>
        {webhookEnabled && (
          <div className="flex flex-col gap-3 pl-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                placeholder="https://hooks.example.com/dreamrue"
                className="max-w-md"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Signing secret</Label>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  data-testid="webhook-secret"
                  className="bg-muted border-border max-w-md flex-1 truncate rounded-md border px-3 py-1.5 font-mono text-xs"
                >
                  {webhookSecret ?? "Not generated yet"}
                </code>
                {webhookSecret && (
                  <Button type="button" size="sm" variant="outline" onClick={() => void copySecret()}>
                    <Copy className="size-3.5" aria-hidden />
                    Copy
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === "secret"}
                  onClick={() => void regenerateSecret()}
                >
                  {busyId === "secret" ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <RefreshCw className="size-3.5" aria-hidden />
                  )}
                  {webhookSecret ? "Regenerate" : "Generate"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Sent as the <code>X-DreamRue-Signature</code> header — a hex HMAC-SHA256 of the raw request body,
                so your endpoint can verify a request actually came from DreamRue. Regenerating invalidates the
                old secret immediately.
              </p>
            </div>
          </div>
        )}
      </section>

      <Button type="submit" disabled={saving} className="self-start">
        {saving && <Spinner className="size-3.5" />}
        Save automation settings
      </Button>
    </form>
  );
}
