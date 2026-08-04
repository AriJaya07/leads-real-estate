"use client";

import { useQuery } from "@tanstack/react-query";
import type { RecentAlertDelivery } from "@/application/alerting/alert-rules.queries";

export const notificationsQueryKey = ["notifications"] as const;

/** Recent alert-rule deliveries, backing the topbar notification panel. */
export function useNotificationsQuery() {
  return useQuery({
    queryKey: notificationsQueryKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/notifications", { signal });
      if (!response.ok) throw new Error(`Failed to load notifications: ${response.status}`);
      const body = (await response.json()) as { deliveries: RecentAlertDelivery[] };
      return body.deliveries;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
