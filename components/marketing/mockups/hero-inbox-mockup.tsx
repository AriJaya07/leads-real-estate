const LEADS = [
  {
    initials: "MK",
    name: "Marta K.",
    intent: "Buyer" as const,
    score: 92,
    quote: "Looking for a 2BR villa in Canggu, budget up to 250k, ready to move in September.",
    muted: false,
  },
  {
    initials: "DS",
    name: "D. Sutanto",
    intent: "Investor" as const,
    score: 74,
    quote: "Anyone know of land plots near Ubud with a 25-year lease?",
    muted: true,
  },
] as const;

const INTENT_STYLE: Record<(typeof LEADS)[number]["intent"], string> = {
  Buyer: "bg-[var(--intent-buyer)]/15 text-[var(--intent-buyer)]",
  Investor: "bg-[var(--intent-investor)]/15 text-[var(--intent-investor)]",
};

const SCORE_STYLE = (score: number) =>
  score >= 80
    ? "bg-[var(--score-high-bg)] text-[var(--score-high-fg)]"
    : "bg-[var(--score-mid-bg)] text-[var(--score-mid-fg)]";

/** The hero's device mockup — the exact inbox rows and floating toast from the UX plan, not a generic illustration. */
export function HeroInboxMockup() {
  return (
    <div className="relative">
      <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-xl">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <span className="text-xs font-semibold">Inbox · today</span>
          <span className="text-muted-foreground font-mono text-[10.5px]">sorted by priority</span>
        </div>
        <div className="flex flex-col">
          {LEADS.map((lead) => (
            <div
              key={lead.name}
              className="border-border/70 flex gap-3 border-b p-4 last:border-b-0"
              style={lead.muted ? { opacity: 0.62 } : undefined}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-[9px] text-xs font-semibold ${INTENT_STYLE[lead.intent]}`}
              >
                {lead.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{lead.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${INTENT_STYLE[lead.intent]}`}
                  >
                    {lead.intent}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${SCORE_STYLE(lead.score)}`}>
                    Score {lead.score}
                  </span>
                </div>
                <p className="font-serif text-[13.5px] leading-snug italic">&ldquo;{lead.quote}&rdquo;</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-border bg-card absolute right-2.5 -bottom-6 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs shadow-lg">
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--health-ok-fg)]" aria-hidden />
        <span>
          <strong className="font-medium">New buyer matched</strong>{" "}
          <span className="text-muted-foreground">· Seminyak · 8s ago</span>
        </span>
      </div>
    </div>
  );
}
