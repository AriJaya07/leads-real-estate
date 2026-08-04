import { format, parseISO } from "date-fns";
import type { LeadTrendPoint } from "@/application/leads/lead-queries";

/**
 * Daily volume, stacked buyer vs. everything else — a magnitude-over-time read
 * (per the dataviz skill) that also surfaces intent mix, so the buyer segment
 * uses `--intent-buyer`, the exact hue the inbox's badges use for the same
 * meaning (see the design doc's "a buyer is blue everywhere" rule). It's a
 * two-way split rather than the full buyer/seller/investor breakdown the
 * design doc sketches — `getLeadTrend` (application/leads/lead-queries.ts)
 * only aggregates `total`/`buyers` per day, and this pass is presentational
 * only, so a real seller/investor-per-day split would need new query work.
 * Each bar anchors to the baseline with a rounded top edge per the dataviz
 * skill's mark spec; the native `title` is the hover layer — enough for a
 * 90-point admin chart without a custom tooltip layer.
 */
export function TrendChart({ points }: { points: LeadTrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.total));

  if (points.every((point) => point.total === 0)) {
    return <p className="text-muted-foreground text-sm">No leads posted in this window yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-32 items-end gap-0.5">
        {points.map((point) => {
          const other = point.total - point.buyers;
          const barHeightPct = point.total === 0 ? 0 : Math.max(2, (point.total / max) * 100);
          const buyerSharePct = point.total === 0 ? 0 : (point.buyers / point.total) * 100;
          return (
            <div
              key={point.date}
              className="group h-full min-w-0 flex-1"
              title={`${format(parseISO(point.date), "d MMM")}: ${point.total} lead${point.total === 1 ? "" : "s"} (${point.buyers} buyer${point.buyers === 1 ? "" : "s"}, ${other} other)`}
            >
              <div className="flex h-full flex-col justify-end">
                <div
                  className="flex flex-col justify-end overflow-hidden rounded-t-sm"
                  style={{ height: `${barHeightPct}%` }}
                >
                  <div
                    className="bg-intent-buyer w-full transition-opacity motion-reduce:transition-none group-hover:opacity-75"
                    style={{ height: `${buyerSharePct}%` }}
                  />
                  <div
                    className="bg-muted-foreground/25 w-full transition-opacity motion-reduce:transition-none group-hover:opacity-75"
                    style={{ height: `${100 - buyerSharePct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{format(parseISO(points[0].date), "d MMM")}</span>
        <span>{format(parseISO(points[points.length - 1].date), "d MMM")}</span>
      </div>
      <div className="text-muted-foreground flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-intent-buyer size-2.5 rounded-sm" aria-hidden />
          Buyer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-muted-foreground/25 size-2.5 rounded-sm" aria-hidden />
          Other intent
        </span>
      </div>
    </div>
  );
}
