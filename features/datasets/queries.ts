"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatasetSummary } from "@/application/datasets/dataset-queries";
import { datasetsQueryKey } from "./query-keys";

export { datasetsQueryKey };

/**
 * Backs the topbar's dataset switcher. Datasets change rarely (a discovery
 * run, a sync completing, an admin pausing one) compared to how often the
 * switcher itself renders — a client cache is a real win here, not a
 * ceremony, which is the bar `docs/architecture.md` sets before reaching for
 * React Query at all.
 */
export function useDatasetsQuery(initialData?: DatasetSummary[]) {
  return useQuery({
    queryKey: datasetsQueryKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/datasets", { signal });
      if (!response.ok) throw new Error(`Failed to load datasets: ${response.status}`);
      const body = (await response.json()) as { datasets: DatasetSummary[] };
      return body.datasets;
    },
    // Matches `listDatasets`'s server-side "use cache" revalidate window
    // (application/datasets/dataset-queries.ts) — no point polling the client
    // cache faster than the server data underneath it actually changes.
    staleTime: 60_000,
    initialData,
  });
}

/**
 * Server actions that change dataset state already call `updateTag`/
 * `revalidateTag` for the *server-rendered* cache — this is the client-side
 * half of the same invalidation, for the React Query cache the topbar reads
 * from. Skipping this half is what "the switcher shows a dataset as paused
 * that was just reactivated" bugs are made of.
 */
export function useInvalidateDatasets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: datasetsQueryKey });
}
