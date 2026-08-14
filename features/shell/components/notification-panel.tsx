"use client";

import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/common/relative-time";
import { cn } from "@/lib/utils";
import { useNotificationsQuery } from "@/features/shell/queries";
import { setLocalStorageValue, useLocalStorageValue } from "@/hooks/use-local-storage-value";

const DISMISSED_KEY = "averonai:notifications:dismissed-before";

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "delivered",
  pending: "queued",
  failed: "failed",
  acknowledged: "acknowledged",
};

/**
 * A popover, not a page — a 10-item list is enough for "what happened
 * recently"; a `/notifications` history route is deliberately not built
 * until this proves too few (see `docs/averonai-uiux-plan.md` §5).
 *
 * "Unread" has no backing column on `alert_deliveries` — it's a client-side
 * high-water mark (localStorage timestamp) rather than a synced-across-devices
 * concept, an intentionally small v1 rather than a new DB migration for a
 * badge count.
 */
export function NotificationPanel() {
  const { data: deliveries = [] } = useNotificationsQuery();
  const dismissedBefore = Number(useLocalStorageValue(DISMISSED_KEY) ?? 0);

  const unreadCount = deliveries.filter((d) => new Date(d.createdAt).getTime() > dismissedBefore).length;

  function markAllRead() {
    setLocalStorageValue(DISMISSED_KEY, String(Date.now()));
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`} className="relative">
            <Bell className="size-4" aria-hidden />
            {unreadCount > 0 && (
              <span className="bg-brand absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full text-[9px] font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-80 max-w-[calc(100vw-1.5rem)] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all read
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {deliveries.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">No alerts fired yet.</p>
          ) : (
            <ul className="flex flex-col">
              {deliveries.map((delivery) => {
                const unread = new Date(delivery.createdAt).getTime() > dismissedBefore;
                return (
                  <li
                    key={delivery.id}
                    className={cn("border-b border-border/60 px-3 py-2.5 text-sm last:border-0", unread && "bg-accent/40")}
                  >
                    <p>
                      <span className="font-medium">{delivery.ruleName ?? "Alert rule"}</span>{" "}
                      <span className="text-muted-foreground">
                        fired{delivery.leadName ? ` for ${delivery.leadName}` : ""} ·{" "}
                        {CHANNEL_LABEL[delivery.channel] ?? delivery.channel} ·{" "}
                        {STATUS_LABEL[delivery.status] ?? delivery.status}
                      </span>
                    </p>
                    <RelativeTime value={delivery.createdAt} className="text-muted-foreground text-xs" />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
