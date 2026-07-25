import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/application/auth/current-user";
import { leadFiltersSchema } from "@/application/leads/filters.schema";
import { queryLeads, getLeadStats } from "@/application/leads/lead-queries";
import { getDynamicAttributeFacets, getLeadFacets } from "@/application/leads/facets";
import { LeadInbox } from "@/features/leads/components/lead-inbox";
import { LeadStatsRow } from "@/features/leads/components/lead-stats-row";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { PageHeader } from "@/components/common/page-header";

export const metadata: Metadata = { title: "Inbox — DreamRue" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Lifts `attr.paidPartnership=true` out of flat search params into `attr`. */
function parseFilters(raw: Record<string, string | string[] | undefined>) {
  const attr: Record<string, string | string[]> = {};
  const rest: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (key.startsWith("attr.")) attr[key.slice(5)] = value;
    else rest[key] = value;
  }

  return leadFiltersSchema.parse({ ...rest, attr });
}

async function Stats({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams);
  const stats = await getLeadStats(filters.datasetId);
  return <LeadStatsRow stats={stats} />;
}

async function Inbox({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams);

  const [page, facets, dynamicFacets] = await Promise.all([
    queryLeads(filters),
    getLeadFacets(filters.datasetId),
    filters.datasetId ? getDynamicAttributeFacets(filters.datasetId) : Promise.resolve([]),
  ]);

  return <LeadInbox page={page} filters={filters} facets={[...facets, ...dynamicFacets]} />;
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

      {/* Filters live in searchParams — a runtime API — so both blocks stream. */}
      <Suspense fallback={<StatRowSkeleton />}>
        <Stats searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
