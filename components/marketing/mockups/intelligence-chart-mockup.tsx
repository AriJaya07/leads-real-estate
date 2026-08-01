const BARS = [
  { label: "Canggu", value: 82, color: "var(--chart-1)" },
  { label: "Uluwatu", value: 61, color: "var(--chart-3)" },
  { label: "Seminyak", value: 54, color: "var(--chart-4)" },
  { label: "Ubud", value: 38, color: "var(--chart-2)" },
  { label: "Sanur", value: 24, color: "var(--chart-5)" },
] as const;

/** Realistic static mockup of the intelligence dashboard's location trend chart. */
export function IntelligenceChartMockup() {
  return (
    <div className="border-border bg-card w-full rounded-2xl border p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-tight">Buyer intent by location</p>
        <p className="text-muted-foreground text-[11px]">Last 30 days</p>
      </div>
      <div className="flex items-end gap-3">
        {BARS.map((bar) => (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5">
            {/* Percentage height needs a parent with a definite height, not an
                `items-end` (auto-height) flex item — hence the nested h-32 box. */}
            <div className="flex h-32 w-full items-end">
              <div
                className="w-full rounded-t-md"
                style={{ height: `${bar.value}%`, backgroundColor: bar.color }}
                aria-hidden
              />
            </div>
            <span className="text-muted-foreground text-[10px]">{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
