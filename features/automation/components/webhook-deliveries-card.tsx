"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/spinner";
import { RelativeTime } from "@/components/common/relative-time";
import { EmptyState } from "@/components/common/empty-state";
import { useServerAction } from "@/hooks/use-server-action";
import { retryWebhookDelivery } from "@/application/automation/webhook-deliveries.actions";
import type { WebhookDeliveryRow } from "@/infrastructure/db/schema/automation";
import { cn } from "@/lib/utils";

/**
 * Read-only view of `webhook_deliveries` plus a retry button — configuring
 * the endpoint/secret itself still lives on `/admin/automation` (one place
 * to own that form, same "don't duplicate, cross-link" posture as Account's
 * Company tab). Deliberately not a full log page: ten most-recent rows,
 * same "popover, not a page" restraint `NotificationPanel` uses.
 */
export function WebhookDeliveriesCard({
  webhookUrl,
  deliveries,
}: {
  webhookUrl: string | null;
  deliveries: WebhookDeliveryRow[];
}) {
  const { busyId, run } = useServerAction();

  async function retry(id: string) {
    await run(id, () => retryWebhookDelivery({ id }), {
      errorFallback: "Retry failed — the endpoint may still be down",
      onSuccess: () => {},
    });
  }

  return (
    <section className="border-border bg-card rounded-xl border p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Webhooks</h2>
        <Button size="sm" variant="outline" render={<Link href="/admin/automation" />}>
          Configure
        </Button>
      </div>

      {webhookUrl ? (
        <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs">
          <span className="bg-[var(--health-ok-fg)] size-1.5 shrink-0 rounded-full" aria-hidden />
          Connected · <span className="font-mono">{webhookUrl}</span>
        </p>
      ) : (
        <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs">
          <span className="bg-muted-foreground size-1.5 shrink-0 rounded-full" aria-hidden />
          Not configured
        </p>
      )}

      {deliveries.length === 0 ? (
        <EmptyState
          title="No deliveries yet"
          description={
            webhookUrl
              ? "Nothing has fired to this endpoint yet — this fills in the next time a lead is created or changes status."
              : "Configure an endpoint on the Automation page to start seeing deliveries here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {deliveries.map((delivery) => (
            <li
              key={delivery.id}
              className="border-border/60 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      delivery.ok
                        ? "bg-[var(--health-ok-bg)] text-[var(--health-ok-fg)]"
                        : "bg-[var(--health-bad-bg)] text-[var(--health-bad-fg)]",
                    )}
                  >
                    {delivery.ok ? "Delivered" : "Failed"}
                    {delivery.statusCode ? ` ${delivery.statusCode}` : ""}
                  </span>
                  <span className="font-mono text-xs">{delivery.event}</span>
                </div>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {delivery.error ?? delivery.url}
                  {" · "}
                  <RelativeTime value={delivery.createdAt} />
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === delivery.id}
                onClick={() => void retry(delivery.id)}
                className="shrink-0"
              >
                {busyId === delivery.id ? <Spinner className="size-3.5" /> : <RotateCcw className="size-3.5" aria-hidden />}
                Retry
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
