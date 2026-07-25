import { StatTile } from "@/components/common/stat-tile";
import { formatCount, formatMinutes } from "@/shared/format";
import type { LeadStats } from "@/application/leads/lead-queries";

/**
 * Time-to-first-touch leads because it is the north-star metric: in social lead
 * capture, being the first responder matters more than being the best one.
 */
export function LeadStatsRow({ stats }: { stats: LeadStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatTile
        label="Median first touch"
        value={formatMinutes(stats.medianTimeToFirstTouchMinutes)}
        hint={stats.medianTimeToFirstTouchMinutes === null ? "No contacts logged yet" : "Post → outreach"}
        emphasis
      />
      <StatTile
        label="Hot buyers"
        value={formatCount(stats.hotBuyers)}
        hint="Buyer intent ≥ 60"
      />
      <StatTile label="All buyers" value={formatCount(stats.buyers)} hint="Demand-side posts" />
      <StatTile
        label="Contactable"
        value={formatCount(stats.contactable)}
        hint="Phone or WhatsApp published"
      />
      <StatTile
        label="Unassigned"
        value={formatCount(stats.unassigned)}
        hint={`${formatCount(stats.newLast24h)} arrived in 24h`}
      />
    </div>
  );
}
