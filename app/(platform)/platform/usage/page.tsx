import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getCompanyUsageOverview } from "@/application/platform/platform-usage-queries";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Platform usage" };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
};

/**
 * The auth check and the query are both uncached/dynamic (`getSession()`
 * reads cookies, `getCompanyUsageOverview()` is a live read) — under Cache
 * Components that has to sit inside a Suspense boundary or the whole route
 * fails to prerender ("blocking route"), same reasoning as `AuthedShell` in
 * `app/(app)/layout.tsx`.
 */
async function PlatformUsageTable() {
  await requirePlatformAdmin();
  const companies = await getCompanyUsageOverview();

  return (
    <>
      <DataTable minWidth="min-w-[720px]">
        <DataTableHead>
          <th>Company</th>
          <th className="w-28">Status</th>
          <th className="w-40">Apify requests</th>
          <th className="w-32">Leads</th>
          <th className="w-28">Datasets</th>
        </DataTableHead>
        <tbody>
          {companies.map((company) => (
            <tr key={company.id} className="border-border border-t">
              <td className="px-3 py-3">
                <div className="font-medium">{company.name}</div>
                <div className="text-muted-foreground font-mono text-xs">{company.slug}</div>
              </td>
              <td className="px-3 py-3">
                <Badge variant="secondary">{STATUS_LABEL[company.status] ?? company.status}</Badge>
              </td>
              <td className="px-3 py-3 font-mono tabular-nums">
                {formatCount(company.apifyRequestsThisMonth)}
              </td>
              <td className="px-3 py-3 font-mono tabular-nums">{formatCount(company.leadsThisMonth)}</td>
              <td className="px-3 py-3 font-mono tabular-nums">{formatCount(company.datasetCount)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      {companies.length === 0 && <p className="text-muted-foreground text-sm">No companies yet.</p>}
    </>
  );
}

/**
 * Cross-company usage, for the platform operator — not a tenant-facing page.
 * Guarded by `requirePlatformAdmin()` (inside the Suspense child below), not
 * `requireOwner()`/`requireAdmin()`: a company `owner` does not pass this.
 * See docs/multi-tenant-apify-isolation-plan.md §3 for why this is usage
 * numbers only, never a cross-company view of actual lead data.
 */
export default function PlatformUsagePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform usage"
        description="Apify requests, leads, and datasets this month, across every company on the platform."
      />
      <Suspense fallback={<TableSkeleton />}>
        <PlatformUsageTable />
      </Suspense>
    </div>
  );
}
