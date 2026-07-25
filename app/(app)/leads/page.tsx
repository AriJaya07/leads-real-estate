import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { requireUser } from "@/application/auth/current-user";
import { parseLeadFilters } from "@/application/leads/filters.schema";
import { queryLeads, getLeadStats } from "@/application/leads/lead-queries";
import { getDynamicAttributeFacets, getLeadFacets } from "@/application/leads/facets";
import { leadFacetsQueryKey, leadStatsQueryKey, leadsQueryKey } from "@/features/leads/query-keys";
import { LeadInbox } from "@/features/leads/components/lead-inbox";
import { LeadStatsRow } from "@/features/leads/components/lead-stats-row";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { PageHeader } from "@/components/common/page-header";
import { getQueryClient } from "@/shared/query-client";

export const metadata: Metadata = { title: "Inbox — DreamRue" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Next's parsed searchParams prop, back into the `URLSearchParams` `parseLeadFilters` expects. */
function toURLSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  return params;
}

/**
 * Prefetches on the server, then hands off to a client component reading the
 * same query through `useLeadStatsQuery` — the fetch itself never happens
 * twice, `dehydrate`/`<HydrationBoundary>` is what carries the result across.
 * Its own Suspense boundary (see below) so it can stream independently of the
 * (usually slower) lead list.
 */
async function Stats({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseLeadFilters(toURLSearchParams(await searchParams));
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: leadStatsQueryKey(filters.datasetId),
    queryFn: () => getLeadStats(filters.datasetId),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LeadStatsRow />
    </HydrationBoundary>
  );
}

async function Inbox({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseLeadFilters(toURLSearchParams(await searchParams));
  const queryClient = getQueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: leadsQueryKey(filters),
      queryFn: () => queryLeads(filters),
    }),
    queryClient.prefetchQuery({
      queryKey: leadFacetsQueryKey(filters.datasetId),
      queryFn: async () => {
        const [facets, dynamicFacets] = await Promise.all([
          getLeadFacets(filters.datasetId),
          filters.datasetId ? getDynamicAttributeFacets(filters.datasetId) : Promise.resolve([]),
        ]);
        return [...facets, ...dynamicFacets];
      },
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LeadInbox />
    </HydrationBoundary>
  );
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  // The shared (app) layout only checks "is anyone signed in" (see its comment
  // on why the mustChangePassword gate can't live there) — this page is the
  // actual DAL enforcement point for both.
  await requireUser();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Lead inbox"
        description="Buyer intent detected across your synced sources, ranked by how winnable it is right now."
      />

      {/* Filters live in searchParams — a runtime API — so both blocks stream.
          After the first paint, filter/sort/page changes never hit this
          Server Component again — LeadInbox re-fetches client-side through
          React Query (features/leads/queries.ts), with the URL kept in sync
          via shallow routing (hooks/use-url-filters.ts). */}
      <Suspense fallback={<StatRowSkeleton />}>
        <Stats searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
