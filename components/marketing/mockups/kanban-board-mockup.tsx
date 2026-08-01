const COLUMNS = [
  { name: "New", cards: ["Made Wirawan", "Sarah Bennett"] },
  { name: "Contacted", cards: ["Kadek Astini"] },
  { name: "Qualified", cards: ["Tom Fletcher"] },
  { name: "Negotiation", cards: ["Wayan Suarta"] },
] as const;

/** Realistic static mockup of the pipeline kanban board. */
export function KanbanBoardMockup() {
  return (
    <div className="border-border bg-card w-full overflow-x-auto rounded-2xl border p-3 shadow-xl">
      <div className="grid min-w-[420px] grid-cols-4 gap-2.5">
        {COLUMNS.map((col) => (
          <div key={col.name} className="flex flex-col gap-2">
            <p className="text-muted-foreground px-1 text-[11px] font-semibold tracking-wide uppercase">
              {col.name} <span className="tabular-nums">{col.cards.length}</span>
            </p>
            <div className="flex flex-col gap-1.5">
              {col.cards.map((name) => (
                <div
                  key={name}
                  className="border-border/70 bg-background border-l-brand rounded-lg border border-l-2 p-2 text-[11px] font-medium"
                >
                  {name}
                </div>
              ))}
              <div className="border-border/40 h-8 rounded-lg border border-dashed" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
