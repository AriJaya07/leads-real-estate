import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { requireUser } from "@/application/auth/current-user";
import { listAssignableTeamMembers } from "@/application/auth/team.actions";
import { type Role, roleAtLeast } from "@/domain/auth/permissions";
import type { CompanyCategory } from "@/domain/verticals/catalog";
import { parseLeadFilters } from "@/application/leads/filters.schema";
import { queryLeads, getLeadStats } from "@/application/leads/lead-queries";
import { getDynamicAttributeFacets, getLeadFacets } from "@/application/leads/facets";
import { getTeamActivityStats } from "@/application/leads/team-activity";
import { getCompanyPlan, getUsageSummary } from "@/application/billing/usage";
import { hasFeature } from "@/domain/billing/plan-features";
import { getSyncOverview } from "@/application/datasets/dataset-queries";
import { getCollectionOverview } from "@/application/collection/scrape-requests.queries";
import { listSavedViews } from "@/application/leads/saved-views.queries";
import {
  leadFacetsQueryKey,
  leadStatsQueryKey,
  leadsQueryKey,
  savedViewsQueryKey,
} from "@/features/leads/query-keys";
import { LeadInbox } from "@/features/leads/components/lead-inbox";
import { LeadStatsRow } from "@/features/leads/components/lead-stats-row";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { StatTile } from "@/components/common/stat-tile";
import { PageHeader } from "@/components/common/page-header";
import { getQueryClient } from "@/shared/query-client";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Inbox — AveronAi" };

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
async function Stats({ searchParams, companyId }: { searchParams: SearchParams; companyId: string }) {
  const filters = parseLeadFilters(toURLSearchParams(await searchParams));
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: leadStatsQueryKey(filters.datasetId),
    queryFn: () => getLeadStats(companyId, filters.datasetId),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LeadStatsRow />
    </HydrationBoundary>
  );
}

/**
 * The "understand what's been collected" half of the dashboard — total
 * volume, how much of it is worth acting on (`dataQualityTier`, see
 * `domain/scoring/lead-validation.ts`), how much of the plan's data budget is
 * used, how active scraping has been, and how active the team has been.
 * Company-wide and not filter-reactive (unlike `LeadStatsRow`, which re-fetches
 * client-side as the dataset scope changes) — a glance-level summary refreshed
 * on page load, not a number someone tunes with the filter panel.
 */
async function DashboardOverview({ searchParams, companyId }: { searchParams: SearchParams; companyId: string }) {
  const filters = parseLeadFilters(toURLSearchParams(await searchParams));

  const [leadStats, usage, syncOverview, collectionOverview, teamActivity] = await Promise.all([
    getLeadStats(companyId, filters.datasetId),
    getUsageSummary(companyId),
    getSyncOverview(companyId),
    getCollectionOverview(companyId),
    getTeamActivityStats(companyId),
  ]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatTile label="Total leads" value={formatCount(leadStats.total)} hint="Unique people collected" />
      <StatTile
        label="High potential leads"
        value={formatCount(leadStats.highPotential)}
        hint={`Of ${formatCount(leadStats.total)} total`}
        emphasis={leadStats.highPotential > 0}
      />
      <StatTile
        label="Data usage"
        value={formatCount(usage?.rawRecordsThisMonth.used ?? 0)}
        hint={usage ? `Of ${formatCount(usage.rawRecordsThisMonth.limit)} records this month` : "No plan on file"}
      />
      <StatTile
        label="Scraping activity"
        value={`${formatCount(syncOverview.runs24h)} syncs (24h)`}
        hint={`${formatCount(syncOverview.failures24h)} failed · ${formatCount(collectionOverview.requests30d)} scrape requests (30d)`}
        emphasis={syncOverview.failures24h > 0}
      />
      <StatTile
        label="Team activity"
        value={`${formatCount(teamActivity.activeAgents)}/${formatCount(teamActivity.totalAgents)} active`}
        hint={`${formatCount(teamActivity.contactedCount)} contacted this week`}
      />
    </div>
  );
}

async function Inbox({
  searchParams,
  companyId,
  companyCategory,
  userId,
  viewerRole,
}: {
  searchParams: SearchParams;
  companyId: string;
  companyCategory: CompanyCategory;
  userId: string;
  viewerRole: Role;
}) {
  const filters = parseLeadFilters(toURLSearchParams(await searchParams));
  const queryClient = getQueryClient();

  const [, , , plan, teamMembers] = await Promise.all([
    queryClient.prefetchQuery({
      queryKey: leadsQueryKey(filters),
      queryFn: () => queryLeads(companyId, filters),
    }),
    queryClient.prefetchQuery({
      queryKey: leadFacetsQueryKey(filters.datasetId),
      queryFn: async () => {
        const [facets, dynamicFacets] = await Promise.all([
          getLeadFacets(companyId, filters.datasetId),
          filters.datasetId ? getDynamicAttributeFacets(companyId, filters.datasetId) : Promise.resolve([]),
        ]);
        return [...facets, ...dynamicFacets];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: savedViewsQueryKey(),
      queryFn: () => listSavedViews(companyId, userId),
    }),
    getCompanyPlan(companyId),
    listAssignableTeamMembers(companyId),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LeadInbox
        canCollectData={roleAtLeast(viewerRole, "manager")}
        currentUserId={userId}
        companyCategory={companyCategory}
        canManageSharedSearches={roleAtLeast(viewerRole, "manager")}
        hasAiAssist={hasFeature(plan?.features, "aiAssistant")}
        teamMembers={teamMembers}
      />
    </HydrationBoundary>
  );
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  // The shared (app) layout only checks "is anyone signed in" (see its comment
  // on why the mustChangePassword gate can't live there) — this page is the
  // actual DAL enforcement point for both.
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Lead inbox"
        description="Every customer record your sources have collected — searchable, filterable, and scored on how likely it is to convert."
      />

      <Suspense fallback={<StatRowSkeleton />}>
        <DashboardOverview searchParams={searchParams} companyId={user.companyId} />
      </Suspense>

      {/* Filters live in searchParams — a runtime API — so both blocks stream.
          After the first paint, filter/sort/page changes never hit this
          Server Component again — LeadInbox re-fetches client-side through
          React Query (features/leads/queries.ts), with the URL kept in sync
          via shallow routing (hooks/use-url-filters.ts). */}
      <Suspense fallback={<StatRowSkeleton />}>
        <Stats searchParams={searchParams} companyId={user.companyId} />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <Inbox
          searchParams={searchParams}
          companyId={user.companyId}
          companyCategory={user.companyCategory}
          userId={user.userId}
          viewerRole={user.role}
        />
      </Suspense>
    </div>
  );
}
