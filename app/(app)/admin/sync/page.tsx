import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { getRecentSyncRuns, getSyncOverview } from "@/application/datasets/dataset-queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { SyncRunsTable } from "@/features/datasets/components/sync-runs-table";

export const metadata: Metadata = { title: "Sync activity" };

async function Overview() {
  const overview = await getSyncOverview();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatTile label="Datasets" value={overview.datasets} hint={`${overview.active} active`} />
      <StatTile label="Due now" value={overview.due} hint="Past their next sync time" />
      <StatTile
        label="Needs attention"
        value={overview.needsAttention}
        hint="Error, degraded or drifted"
        emphasis={overview.needsAttention > 0}
      />
      <StatTile
        label="Syncs (24h)"
        value={overview.runs24h}
        hint={`${overview.failures24h} failed`}
        emphasis={overview.failures24h > 0}
      />
      <StatTile label="Leads (24h)" value={overview.leads24h} />
    </div>
  );
}

async function RecentActivity() {
  const runs = await getRecentSyncRuns(50);
  return <SyncRunsTable runs={runs} showDataset />;
}

export default async function AdminSyncPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Sync activity"
        description="Every sync run across every dataset, most recent first. Open a run to see its log."
      />

      <Suspense fallback={<StatRowSkeleton />}>
        <Overview />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <RecentActivity />
      </Suspense>
    </div>
  );
}
