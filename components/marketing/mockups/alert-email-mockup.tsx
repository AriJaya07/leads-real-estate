/** Realistic static mockup of a digest alert email — one per rule per sync run. */
export function AlertEmailMockup() {
  return (
    <div className="border-border bg-card w-full rounded-2xl border p-1.5 shadow-xl">
      <div className="border-border/70 flex items-center gap-2 border-b px-3 py-2.5">
        <span className="bg-accent-warm/20 text-accent-warm flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">High-intent Bali buyer — 2 matches</p>
          <p className="text-muted-foreground text-[11px]">alerts@dreamrue.com to sales-team@</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {[
          { name: "Made Wirawan", detail: "Buyer score 91 · Canggu · $300k" },
          { name: "Sarah Bennett", detail: "Buyer score 84 · Uluwatu · $450k" },
        ].map((lead) => (
          <div key={lead.name} className="border-border/70 bg-background rounded-lg border p-2.5">
            <p className="text-[12px] font-medium">{lead.name}</p>
            <p className="text-muted-foreground text-[11px]">{lead.detail}</p>
          </div>
        ))}
        <p className="text-muted-foreground px-0.5 text-[10px]">One digest per rule per sync run — not per lead.</p>
      </div>
    </div>
  );
}
