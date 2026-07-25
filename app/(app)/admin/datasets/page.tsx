import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { listDatasets } from "@/application/datasets/dataset-queries";
import { getSyncOverview } from "@/application/datasets/dataset-queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { DatasetTable } from "@/features/datasets/components/dataset-table";
import { DiscoveryButton } from "@/features/datasets/components/discovery-button";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";

export const metadata: Metadata = { title: "Datasets" };

async function Overview() {
  const overview = await getSyncOverview();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatTile label="Datasets" value={overview.datasets} hint={`${overview.active} active`} />
      <StatTile label="Healthy" value={overview.healthy} />
      <StatTile
        label="Needs attention"
        value={overview.needsAttention}
        hint="Error, degraded or drifted"
        emphasis={overview.needsAttention > 0}
      />
      <StatTile label="Syncs (24h)" value={overview.runs24h} hint={`${overview.failures24h} failed`} />
      <StatTile label="Leads (24h)" value={overview.leads24h} />
    </div>
  );
}

async function Registry() {
  const datasets = await listDatasets();
  return <DatasetTable datasets={datasets} />;
}

export default async function AdminDatasetsPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Dataset registry"
        description="Every dataset your sources expose, discovered automatically. Nothing here requires a code change or an environment variable."
        actions={<DiscoveryButton />}
      />

      <Suspense fallback={<StatRowSkeleton />}>
        <Overview />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <Registry />
      </Suspense>
    </div>
  );
}
