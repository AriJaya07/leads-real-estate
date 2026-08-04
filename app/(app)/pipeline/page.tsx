import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { requireUser } from "@/application/auth/current-user";
import { listAssignableTeamMembers } from "@/application/auth/team.actions";
import { DEFAULT_FILTERS } from "@/application/leads/filters.schema";
import { queryLeads } from "@/application/leads/lead-queries";
import { leadsQueryKey } from "@/features/leads/query-keys";
import { PIPELINE_STATUSES, TERMINAL_STATUSES } from "@/application/leads/lead-status";
import { PageHeader } from "@/components/common/page-header";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { PipelineBoard } from "@/features/pipeline/components/pipeline-board";
import { getQueryClient } from "@/shared/query-client";

export const metadata: Metadata = { title: "Pipeline" };

type SearchParams = Promise<{ datasetId?: string }>;

/**
 * One prefetch per column — same `queryLeads` every other page uses, just
 * fanned out over every status instead of one filter set. `PipelineBoard`
 * reads each through the same `useLeadsQuery` hook the inbox uses, so the
 * prefetch and the client read share a query key and the fetch never repeats.
 */
async function Board({
  searchParams,
  companyId,
  currentUserId,
}: {
  searchParams: SearchParams;
  companyId: string;
  currentUserId: string;
}) {
  const { datasetId } = await searchParams;
  const queryClient = getQueryClient();

  const [teamMembers] = await Promise.all([
    listAssignableTeamMembers(companyId),
    ...[...PIPELINE_STATUSES, ...TERMINAL_STATUSES].map((status) => {
      const filters = { ...DEFAULT_FILTERS, datasetId, status: [status], sort: "priority" as const, pageSize: 50 };
      return queryClient.prefetchQuery({
        queryKey: leadsQueryKey(filters),
        queryFn: () => queryLeads(companyId, filters),
      });
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PipelineBoard teamMembers={teamMembers} currentUserId={currentUserId} />
    </HydrationBoundary>
  );
}

export default async function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Pipeline"
        description="Every lead's status, from new to converted. Drag a card to another column, or use the Move dropdown on any card."
      />

      <Suspense fallback={<TableSkeleton />}>
        <Board searchParams={searchParams} companyId={user.companyId} currentUserId={user.userId} />
      </Suspense>
    </div>
  );
}
