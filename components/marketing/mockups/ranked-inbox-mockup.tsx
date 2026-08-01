const LEADS = [
  { name: "Made Wirawan", intent: "Buyer", score: 91, location: "Canggu", budget: "$300k" },
  { name: "Sarah Bennett", intent: "Buyer", score: 84, location: "Uluwatu", budget: "$450k" },
  { name: "Kadek Astini", intent: "Investor", score: 76, location: "Seminyak", budget: "$1.2M" },
] as const;

const INTENT_DOT: Record<(typeof LEADS)[number]["intent"], string> = {
  Buyer: "bg-[var(--intent-buyer)]",
  Investor: "bg-[var(--intent-investor)]",
};

/** Realistic static mockup of the ranked lead inbox — not a screenshot, but styled with the app's real intent tokens. */
export function RankedInboxMockup() {
  return (
    <div className="border-border bg-card w-full rounded-2xl border p-1.5 shadow-xl">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold tracking-tight">Lead inbox</span>
        <span className="text-muted-foreground text-[11px]">Sorted by priority</span>
      </div>
      <div className="flex flex-col gap-1.5 p-1.5">
        {LEADS.map((lead, i) => (
          <div
            key={lead.name}
            className="border-border/70 bg-background flex items-center gap-3 rounded-xl border p-2.5"
          >
            <span className="text-muted-foreground w-4 shrink-0 text-center text-[11px] tabular-nums">{i + 1}</span>
            <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
              {lead.name.split(" ").map((p) => p[0]).join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-tight font-medium">{lead.name}</p>
              <p className="text-muted-foreground flex items-center gap-1 text-[11px] leading-tight">
                <span className={`size-1.5 rounded-full ${INTENT_DOT[lead.intent]}`} aria-hidden />
                {lead.intent} · {lead.location} · {lead.budget}
              </p>
            </div>
            <span className="bg-[var(--score-high-bg)] text-[var(--score-high-fg)] shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums">
              {lead.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
