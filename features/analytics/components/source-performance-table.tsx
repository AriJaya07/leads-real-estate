"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { toCsv } from "@/shared/csv";
import { downloadCsv } from "@/shared/download-csv";
import { formatCount, formatUsd } from "@/shared/format";
import type { SourcePerformance } from "@/application/analytics/source-performance";

export function SourcePerformanceTable({ rows }: { rows: SourcePerformance[] }) {
  function exportCsv() {
    const csv = toCsv(rows, [
      { header: "Source", value: (row) => row.sourceName },
      { header: "Leads", value: (row) => row.leadCount },
      { header: "Buyers", value: (row) => row.buyerCount },
      { header: "Avg buyer score", value: (row) => row.avgBuyerScore },
      { header: "Contacted", value: (row) => row.contactedCount },
      { header: "Closed", value: (row) => row.closedCount },
      { header: "Revenue (USD)", value: (row) => row.closedRevenueUsd },
      { header: "Conversion %", value: (row) => row.conversionPct.toFixed(1) },
    ]);
    downloadCsv(`dreamrue-source-performance-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No source data yet"
        description="Connect a data source under Collect data to see performance broken down by where leads come from."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="size-3.5" aria-hidden />
          Export CSV
        </Button>
      </div>
      <DataTable minWidth="min-w-[760px]">
        <DataTableHead>
          <th>Source</th>
          <th className="w-20">Leads</th>
          <th className="w-20">Buyers</th>
          <th className="w-24">Avg score</th>
          <th className="w-24">Contacted</th>
          <th className="w-20">Closed</th>
          <th className="w-28">Revenue</th>
          <th className="w-24">Conversion</th>
        </DataTableHead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sourceId} className="border-border border-t">
              <td className="px-3 py-2.5 font-medium">{row.sourceName}</td>
              <td className="px-3 py-2.5">{formatCount(row.leadCount)}</td>
              <td className="px-3 py-2.5">{formatCount(row.buyerCount)}</td>
              <td className="px-3 py-2.5">{row.avgBuyerScore ?? "—"}</td>
              <td className="px-3 py-2.5">{formatCount(row.contactedCount)}</td>
              <td className="px-3 py-2.5">{formatCount(row.closedCount)}</td>
              <td className="px-3 py-2.5">{formatUsd(row.closedRevenueUsd)}</td>
              <td className="px-3 py-2.5">{row.conversionPct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
