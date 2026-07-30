import type { ConversionFunnel } from "@/application/analytics/conversion";
import { leadStatusLabel } from "@/application/leads/lead-status";
import { formatCount } from "@/shared/format";

/**
 * Each row is "leads that ever reached at least this stage" (see
 * `conversion.ts`'s own doc comment on why that's the accurate read, not
 * "currently sitting here"). The percentage on the right is stage-to-stage
 * conversion — `count / previous stage's count` — not "of all leads," which
 * is why the first stage's percentage column is blank.
 */
export function ConversionFunnelChart({ funnel }: { funnel: ConversionFunnel }) {
  if (funnel.total === 0) {
    return <p className="text-muted-foreground text-sm">No leads yet.</p>;
  }

  const max = Math.max(1, ...funnel.stages.map((stage) => stage.count));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {funnel.stages.map((stage) => (
          <div key={stage.status} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs capitalize">{leadStatusLabel(stage.status)}</span>
            <div className="bg-muted h-5 min-w-0 flex-1 overflow-hidden rounded">
              <div
                className="bg-chart-1 h-full rounded"
                style={{ width: `${Math.max(4, (stage.count / max) * 100)}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums">
              {formatCount(stage.count)}
            </span>
            <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
              {stage.conversionFromPreviousPct === null ? "—" : `${stage.conversionFromPreviousPct.toFixed(0)}%`}
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {formatCount(funnel.rejected)} rejected along the way · {funnel.overallConversionPct.toFixed(1)}% of all
        leads ever reach closed.
      </p>
    </div>
  );
}
