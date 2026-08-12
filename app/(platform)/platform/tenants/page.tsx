import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getTenantOverview } from "@/application/platform/tenants.queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { PlatformShell } from "@/components/platform/platform-shell";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Tenants" };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
};

/**
 * The auth check and the query are both uncached/dynamic (`getSession()`
 * reads cookies, `getTenantOverview()` is a live read) — under Cache
 * Components that has to sit inside a Suspense boundary or the whole route
 * fails to prerender ("blocking route"), same reasoning as `AuthedShell` in
 * `app/(app)/layout.tsx`.
 */
async function TenantsContent() {
  const user = await requirePlatformAdmin();
  const { stats, tenants } = await getTenantOverview();

  return (
    <PlatformShell active="tenants" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Tenants"
          description={`${stats.activeTenants} active workspaces · no tenant's leads render here, ever`}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Active tenants" value={stats.activeTenants} />
          <StatTile
            label="Sync issues"
            value={stats.tenantsWithSyncIssues}
            tone={stats.tenantsWithSyncIssues > 0 ? "warn" : undefined}
          />
          <StatTile label="Trials ending 7d" value={stats.trialsEndingSoon} />
        </div>

        <DataTable minWidth="min-w-[820px]">
          <DataTableHead>
            <th>Tenant</th>
            <th className="w-32">Category</th>
            <th className="w-28">Status</th>
            <th className="w-32">Apify requests</th>
            <th className="w-24">Leads</th>
            <th className="w-24">Datasets</th>
            <th className="w-24">Health</th>
          </DataTableHead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-border border-t">
                <td className="px-3 py-3">
                  <Link href={`/platform/tenants/${tenant.id}`} className="font-medium hover:underline">
                    {tenant.name}
                  </Link>
                  <div className="text-muted-foreground font-mono text-xs">{tenant.slug}</div>
                </td>
                <td className="px-3 py-3 text-sm">{tenant.categoryLabel}</td>
                <td className="px-3 py-3">
                  <Badge variant="secondary">{STATUS_LABEL[tenant.status] ?? tenant.status}</Badge>
                </td>
                <td className="px-3 py-3 font-mono tabular-nums">{formatCount(tenant.apifyRequestsThisMonth)}</td>
                <td className="px-3 py-3 font-mono tabular-nums">{formatCount(tenant.leadsThisMonth)}</td>
                <td className="px-3 py-3 font-mono tabular-nums">{formatCount(tenant.datasetCount)}</td>
                <td className="px-3 py-3">
                  <Badge variant={tenant.health === "issues" ? "destructive" : "secondary"}>
                    {tenant.health === "issues" ? "Issues" : "Healthy"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>

        {tenants.length === 0 && <p className="text-muted-foreground text-sm">No companies yet.</p>}
      </div>
    </PlatformShell>
  );
}

export default function PlatformTenantsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6 p-4 sm:p-6">
          <StatRowSkeleton />
          <TableSkeleton />
        </div>
      }
    >
      <TenantsContent />
    </Suspense>
  );
}
