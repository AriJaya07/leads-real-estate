"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { LeadFilters } from "@/application/leads/filters.schema";
import { serializeLeadFilters } from "@/application/leads/filters.schema";
import type { LeadPage, LeadStats } from "@/application/leads/lead-queries";
import type { FacetDescriptor } from "@/application/leads/facets";
import { leadFacetsQueryKey, leadStatsQueryKey, leadsQueryKey } from "./query-keys";

export { leadFacetsQueryKey, leadStatsQueryKey, leadsQueryKey };

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Request to ${url} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Every filter/sort/page change re-fetches through here. `keepPreviousData`
 * is what makes that feel instant rather than flashing to a loading state —
 * the previous page's rows stay on screen (dimmed via `isPlaceholderData`
 * in the consuming component) until the new ones arrive.
 */
export function useLeadsQuery(filters: LeadFilters, initialData?: LeadPage) {
  return useQuery({
    queryKey: leadsQueryKey(filters),
    queryFn: ({ signal }) =>
      fetchJson<{ page: LeadPage }>(`/api/leads?${serializeLeadFilters(filters)}`, signal).then(
        (body) => body.page,
      ),
    placeholderData: keepPreviousData,
    initialData,
  });
}

/**
 * Keyed on `datasetId` alone, not the full filter set — changing sort, page,
 * or a text search must not re-fetch the facet list, which only depends on
 * which dataset is in scope. This is the concrete "React Query optimization"
 * over the previous RSC version, which re-ran both on every filter change.
 */
export function useLeadFacetsQuery(datasetId: string | undefined, initialData?: FacetDescriptor[]) {
  return useQuery({
    queryKey: leadFacetsQueryKey(datasetId),
    queryFn: ({ signal }) => {
      const params = datasetId ? `?datasetId=${datasetId}` : "";
      return fetchJson<{ facets: FacetDescriptor[] }>(`/api/leads/facets${params}`, signal).then(
        (body) => body.facets,
      );
    },
    // Longer than the client default (30s): the server side of this same
    // query is now `"use cache"`-backed with a 1-minute revalidate window
    // (application/leads/facets.ts), so refetching more often than that just
    // re-requests the same cached server response.
    staleTime: 60_000,
    initialData,
  });
}

/** Same reasoning as `useLeadFacetsQuery` — the stats row doesn't depend on sort/page either. */
export function useLeadStatsQuery(datasetId: string | undefined, initialData?: LeadStats) {
  return useQuery({
    queryKey: leadStatsQueryKey(datasetId),
    queryFn: ({ signal }) => {
      const params = datasetId ? `?datasetId=${datasetId}` : "";
      return fetchJson<{ stats: LeadStats }>(`/api/leads/stats${params}`, signal).then(
        (body) => body.stats,
      );
    },
    staleTime: 60_000,
    initialData,
  });
}
