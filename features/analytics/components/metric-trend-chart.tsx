import { format, parseISO } from "date-fns";

export interface MetricTrendPoint {
  date: string;
  value: number;
}

/**
 * Generic daily-value bar chart — the same visual shape as
 * `features/intelligence/components/trend-chart.tsx` (magnitude over time,
 * one hue, native `title` tooltip), generalized to any numeric metric
 * (revenue, activity count) instead of being locked to `LeadTrendPoint`. Kept
 * as a separate component rather than widening the intelligence page's
 * already-shipped, e2e-tested chart — same visual language, zero risk to it.
 */
export function MetricTrendChart({
  points,
  emptyMessage = "No data in this window yet.",
  formatValue = (value: number) => String(value),
}: {
  points: MetricTrendPoint[];
  emptyMessage?: string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));

  if (points.length === 0 || points.every((point) => point.value === 0)) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-28 items-end gap-0.5">
        {points.map((point) => (
          <div
            key={point.date}
            className="group h-full min-w-0 flex-1"
            title={`${format(parseISO(point.date), "d MMM")}: ${formatValue(point.value)}`}
          >
            <div className="flex h-full flex-col justify-end">
              <div
                className="bg-chart-1 group-hover:bg-chart-1/70 w-full rounded-t-sm transition-colors"
                style={{ height: `${Math.max(2, (point.value / max) * 100)}%` }}
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
