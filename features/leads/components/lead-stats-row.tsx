"use client";

import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { ErrorState } from "@/components/common/error-state";
import { formatCount, formatMinutes } from "@/shared/format";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useLeadStatsQuery } from "@/features/leads/queries";

/**
 * Time-to-first-touch leads because it is the north-star metric: in social lead
 * capture, being the first responder matters more than being the best one.
 *
 * Self-sufficient: reads `datasetId` from the URL itself and fetches through
 * `useLeadStatsQuery`, which only re-runs when `datasetId` changes — not on
 * every sort/page/search tweak, since none of those affect these numbers.
 */
export function LeadStatsRow() {
  const { searchParams } = useUrlFilters();
  const datasetId = searchParams.get("datasetId") ?? undefined;
  const { data: stats, isError, refetch } = useLeadStatsQuery(datasetId);

  if (isError) {
    return <ErrorState title="Couldn't load stats" onRetry={() => void refetch()} />;
  }
  if (!stats) return <StatRowSkeleton />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* North star: everything else on this row is context for this one number. */}
      <StatTile
        label="Median time to first touch"
        value={formatMinutes(stats.medianTimeToFirstTouchMinutes)}
        hint={stats.medianTimeToFirstTouchMinutes === null ? "No contacts logged yet" : "Post → outreach"}
        emphasis
      />
      <StatTile label="New today" value={formatCount(stats.newLast24h)} hint="Arrived in the last 24h" />
      <StatTile
        label="Uncontacted > 2h"
        value={formatCount(stats.uncontactedOver2h)}
        hint={stats.uncontactedOver2h > 0 ? "Needs attention" : "All caught up"}
        tone={stats.uncontactedOver2h > 0 ? "bad" : undefined}
      />
      <StatTile label="High score (80+)" value={formatCount(stats.highScore)} hint="Top of the priority sort" />
    </div>
  );
}
