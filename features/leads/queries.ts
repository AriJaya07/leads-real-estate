"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { LeadFilters } from "@/application/leads/filters.schema";
import { serializeLeadFilters } from "@/application/leads/filters.schema";
import type {
  LeadAppearanceListItem,
  LeadEventItem,
  LeadListItem,
  LeadPage,
  LeadStats,
} from "@/application/leads/lead-queries";
import type { SavedViewRow } from "@/infrastructure/db/schema/leads";
import type { LeadValidationResult } from "@/domain/scoring/lead-validation";
import type { FacetDescriptor } from "@/application/leads/facets";
import type {
  LeadAffiliation,
  TargetCompanyOption,
} from "@/application/companies/target-company-queries";
import {
  leadAffiliationsQueryKey,
  leadAppearancesQueryKey,
  leadEventsQueryKey,
  leadFacetsQueryKey,
  leadSimilarQueryKey,
  leadStatsQueryKey,
  leadValidationQueryKey,
  leadsQueryKey,
  savedViewsQueryKey,
} from "./query-keys";

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

/**
 * Every source a lead was collected from — fetched only once the detail sheet
 * for that lead is actually open (`enabled`), since the full appearance
 * history is never needed for the list/card view.
 */
export function useLeadAppearancesQuery(leadId: string | undefined) {
  return useQuery({
    queryKey: leadAppearancesQueryKey(leadId ?? ""),
    queryFn: ({ signal }) =>
      fetchJson<{ appearances: LeadAppearanceListItem[] }>(
        `/api/leads/${leadId}/appearances`,
        signal,
      ).then((body) => body.appearances),
    enabled: Boolean(leadId),
  });
}

/** Every target company this lead is linked to — same "only while the sheet is open" gating as appearances. */
export function useLeadAffiliationsQuery(leadId: string | undefined) {
  return useQuery({
    queryKey: leadAffiliationsQueryKey(leadId ?? ""),
    queryFn: ({ signal }) =>
      fetchJson<{ affiliations: LeadAffiliation[] }>(`/api/leads/${leadId}/affiliations`, signal).then(
        (body) => body.affiliations,
      ),
    enabled: Boolean(leadId),
  });
}

/** Data validation + lead score for the open detail sheet — same "only while open" gating as appearances/affiliations. */
export function useLeadValidationQuery(leadId: string | undefined) {
  return useQuery({
    queryKey: leadValidationQueryKey(leadId ?? ""),
    queryFn: ({ signal }) =>
      fetchJson<{ validation: LeadValidationResult }>(`/api/leads/${leadId}/validation`, signal).then(
        (body) => body.validation,
      ),
    enabled: Boolean(leadId),
  });
}

/** "Leads like this one" — same "only while the sheet is open" gating as appearances/affiliations/validation. */
export function useLeadSimilarQuery(leadId: string | undefined) {
  return useQuery({
    queryKey: leadSimilarQueryKey(leadId ?? ""),
    queryFn: ({ signal }) =>
      fetchJson<{ leads: LeadListItem[] }>(`/api/leads/${leadId}/similar`, signal).then((body) => body.leads),
    enabled: Boolean(leadId),
  });
}

/** Full status/assignment/note/contact/alert history for the open detail sheet's "Activity" section. */
export function useLeadEventsQuery(leadId: string | undefined) {
  return useQuery({
    queryKey: leadEventsQueryKey(leadId ?? ""),
    queryFn: ({ signal }) =>
      fetchJson<{ events: LeadEventItem[] }>(`/api/leads/${leadId}/events`, signal).then((body) => body.events),
    enabled: Boolean(leadId),
  });
}

/**
 * A user's own saved searches plus every one the team has shared. Server-
 * prefetched on first paint (`app/(app)/leads/page.tsx`, same `HydrationBoundary`
 * pattern as facets/stats); this `queryFn` is what runs on every refetch after
 * that (create/delete invalidates this key via `useServerAction`'s `invalidateKeys`).
 */
export function useSavedViewsQuery(initialData?: SavedViewRow[]) {
  return useQuery({
    queryKey: savedViewsQueryKey(),
    queryFn: ({ signal }) =>
      fetchJson<{ views: SavedViewRow[] }>("/api/leads/saved-views", signal).then((body) => body.views),
    staleTime: 60_000,
    initialData,
  });
}

/** Search-as-you-type for the "link a company" combobox — disabled until the caller has typed something. */
export function useTargetCompanySearchQuery(query: string) {
  return useQuery({
    queryKey: ["target-companies", "search", query] as const,
    queryFn: ({ signal }) =>
      fetchJson<{ companies: TargetCompanyOption[] }>(
        `/api/target-companies?q=${encodeURIComponent(query)}`,
        signal,
      ).then((body) => body.companies),
    enabled: query.trim().length > 0,
    staleTime: 10_000,
  });
}
