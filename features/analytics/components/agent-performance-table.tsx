"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import { toCsv } from "@/shared/csv";
import { downloadCsv } from "@/shared/download-csv";
import { formatCount, formatMinutes, formatUsd } from "@/shared/format";
import type { AgentPerformance } from "@/application/analytics/agent-performance";

/**
 * Same warn/bad tone tokens `ScoreBadge`/`HealthPill` use, reused here on top
 * of `formatMinutes`'s own text — the number is already the label, this just
 * reinforces it the way the design doc colours other magnitude figures.
 */
function ttftToneClassName(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes >= 45) return "text-[var(--health-bad-fg)]";
  if (minutes >= 15) return "text-[var(--health-warn-fg)]";
  return "text-[var(--health-ok-fg)]";
}

export function AgentPerformanceTable({ rows }: { rows: AgentPerformance[] }) {
  function exportCsv() {
    const csv = toCsv(rows, [
      { header: "Agent", value: (row) => row.name ?? "Unnamed" },
      { header: "Leads assigned", value: (row) => row.leadCount },
      { header: "Contacted", value: (row) => row.contactedCount },
      { header: "Closed", value: (row) => row.closedCount },
      { header: "Revenue (USD)", value: (row) => row.closedRevenueUsd },
      { header: "Median time to first touch (min)", value: (row) => row.medianTimeToFirstTouchMinutes },
      { header: "Conversion %", value: (row) => row.conversionPct.toFixed(1) },
    ]);
    downloadCsv(`averonai-agent-performance-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (rows.length === 0) {
    return <EmptyState title="No team members yet" description="Invite teammates from the Team page to see agent performance here." />;
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
          <th>Agent</th>
          <th className="w-24">Leads</th>
          <th className="w-24">Contacted</th>
          <th className="w-20">Closed</th>
          <th className="w-28">Revenue</th>
          <th className="w-28">Median TTFT</th>
          <th className="w-24">Conversion</th>
        </DataTableHead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className="border-border border-t">
              <td className="px-3 py-2.5 font-medium">{row.name ?? "Unnamed"}</td>
              <td className="px-3 py-2.5">{formatCount(row.leadCount)}</td>
              <td className="px-3 py-2.5">{formatCount(row.contactedCount)}</td>
              <td className="px-3 py-2.5">{formatCount(row.closedCount)}</td>
              <td className="px-3 py-2.5">{formatUsd(row.closedRevenueUsd)}</td>
              <td className={cn("px-3 py-2.5 font-medium", ttftToneClassName(row.medianTimeToFirstTouchMinutes))}>
                {formatMinutes(row.medianTimeToFirstTouchMinutes)}
              </td>
              <td className="px-3 py-2.5">{row.conversionPct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
