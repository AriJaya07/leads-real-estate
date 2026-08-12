import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getConnectorHealthOverview } from "@/application/platform/connectors.queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { HealthPill } from "@/components/common/health-pill";
import { RelativeTime } from "@/components/common/relative-time";
import { PlatformShell } from "@/components/platform/platform-shell";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Connector Health" };

async function ConnectorsContent() {
  const user = await requirePlatformAdmin();
  const overview = await getConnectorHealthOverview();
  const healthyCount = overview.byHealth.find((r) => r.health === "healthy")?.count ?? 0;
  const unknownCount = overview.byHealth.find((r) => r.health === "unknown")?.count ?? 0;
  const totalCount = overview.byHealth.reduce((sum, r) => sum + r.count, 0);

  return (
    <PlatformShell active="connectors" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Connector Health"
          description="Every non-healthy dataset across every tenant — a source about to silently stop producing leads for someone, surfaced platform-wide instead of one /admin/sync page at a time."
        />

        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile label="Healthy datasets" value={formatCount(healthyCount)} />
          <StatTile
            label="Needs attention"
            value={formatCount(overview.problemDatasets.length)}
            tone={overview.problemDatasets.length > 0 ? "warn" : undefined}
          />
          <StatTile label="Never synced yet" value={formatCount(unknownCount)} />
          <StatTile label="Total datasets" value={formatCount(totalCount)} />
        </div>

        {overview.problemDatasets.length === 0 ? (
          <EmptyState
            title={
              healthyCount === totalCount
                ? "Every tenant's connectors are healthy"
                : "Nothing needs attention right now"
            }
            description={
              unknownCount > 0
                ? `${formatCount(unknownCount)} dataset${unknownCount === 1 ? "" : "s"} haven't synced yet, so their health is still unknown — not a problem, just not verified.`
                : "Nothing needs attention right now."
            }
          />
        ) : (
          <DataTable minWidth="min-w-[680px]">
            <DataTableHead>
              <th>Dataset</th>
              <th>Tenant</th>
              <th className="w-32">Health</th>
              <th className="w-32">Last synced</th>
            </DataTableHead>
            <tbody>
              {overview.problemDatasets.map((d) => (
                <tr key={d.id} className="border-border border-t">
                  <td className="px-3 py-3 font-medium">{d.name}</td>
                  <td className="px-3 py-3">
                    <div className="text-sm">{d.companyName}</div>
                    <div className="text-muted-foreground font-mono text-xs">{d.companySlug}</div>
                  </td>
                  <td className="px-3 py-3">
                    <HealthPill health={d.health} />
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-sm">
                    <RelativeTime value={d.lastSyncedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </PlatformShell>
  );
}

export default function PlatformConnectorsPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6"><StatRowSkeleton /></div>}>
      <ConnectorsContent />
    </Suspense>
  );
}
