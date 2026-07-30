import type { LeadFilters } from "@/application/leads/filters.schema";

/**
 * Pure key functions, deliberately in a directive-free module: both server
 * (app/(app)/leads/page.tsx's prefetchQuery) and client (features/leads/queries.ts's
 * useQuery) call these, and a "use client" module's exports become client
 * references that a Server Component can't invoke directly.
 */
export const leadsQueryKey = (filters: LeadFilters) => ["leads", "list", filters] as const;
export const leadFacetsQueryKey = (datasetId?: string) =>
  ["leads", "facets", datasetId ?? null] as const;
export const leadStatsQueryKey = (datasetId?: string) =>
  ["leads", "stats", datasetId ?? null] as const;
export const leadAppearancesQueryKey = (leadId: string) => ["leads", "appearances", leadId] as const;
export const leadAffiliationsQueryKey = (leadId: string) => ["leads", "affiliations", leadId] as const;
export const leadValidationQueryKey = (leadId: string) => ["leads", "validation", leadId] as const;
export const leadSimilarQueryKey = (leadId: string) => ["leads", "similar", leadId] as const;
export const leadEventsQueryKey = (leadId: string) => ["leads", "events", leadId] as const;
export const savedViewsQueryKey = () => ["leads", "saved-views"] as const;
