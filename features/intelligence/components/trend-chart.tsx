import { format, parseISO } from "date-fns";
import type { LeadTrendPoint } from "@/application/leads/lead-queries";

/**
 * Daily volume as a thin bar per day, single hue (this is a magnitude-over-time
 * read, not an identity comparison — see `BreakdownBars` for the categorical
 * case). Each bar anchors to the baseline with a rounded top edge per the
 * dataviz skill's mark spec; the native `title` is the hover layer — enough
 * for a 30-point admin chart without a custom tooltip layer.
 */
export function TrendChart({ points }: { points: LeadTrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.total));

  if (points.every((point) => point.total === 0)) {
    return <p className="text-muted-foreground text-sm">No leads posted in this window yet.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-28 items-end gap-0.5">
        {points.map((point) => (
          <div
            key={point.date}
            className="group h-full min-w-0 flex-1"
            title={`${format(parseISO(point.date), "d MMM")}: ${point.total} lead${point.total === 1 ? "" : "s"} (${point.buyers} buyer${point.buyers === 1 ? "" : "s"})`}
          >
            <div className="flex h-full flex-col justify-end">
              <div
                className="bg-chart-1 group-hover:bg-chart-1/70 w-full rounded-t-sm transition-colors"
                style={{ height: `${Math.max(2, (point.total / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{format(parseISO(points[0].date), "d MMM")}</span>
        <span>{format(parseISO(points[points.length - 1].date), "d MMM")}</span>
      </div>
    </div>
  );
}
