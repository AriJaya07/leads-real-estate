import { cn } from "@/lib/utils";

type IconProps = { className?: string };

/** Two duplicate profile chips converging into one — identity merge. */
export function LeadMergeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 32" fill="none" className={cn("size-10", className)} aria-hidden>
      <rect x="1" y="3" width="17" height="10" rx="5" className="fill-muted stroke-border" strokeWidth="1" />
      <circle cx="7" cy="8" r="2.5" className="fill-brand/70" />
      <rect x="4.5" y="14.5" width="21" height="10" rx="5" className="fill-muted stroke-border" strokeWidth="1" />
      <circle cx="10.5" cy="19.5" r="2.5" className="fill-brand/70" />
      <path d="M18 8 C 26 8, 28 24, 33 24" className="stroke-accent-warm" strokeWidth="1.25" strokeDasharray="2.5 2.5" fill="none" />
      <path d="M25.5 19.5 C 28 19.5, 30 22, 33 24" className="stroke-accent-warm" strokeWidth="1.25" strokeDasharray="2.5 2.5" fill="none" />
      <rect x="32" y="18" width="15" height="11" rx="5.5" className="fill-brand/15 stroke-brand" strokeWidth="1.25" />
      <circle cx="38.5" cy="23.5" r="2.75" className="fill-brand" />
    </svg>
  );
}

/** A mini scored post with a highlighted phrase and a score badge. */
export function ScoredPostIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 32" fill="none" className={cn("size-10", className)} aria-hidden>
      <rect x="1" y="1" width="46" height="30" rx="6" className="fill-muted stroke-border" strokeWidth="1" />
      <circle cx="9" cy="9" r="3" className="fill-border" />
      <rect x="15" y="7.5" width="16" height="3" rx="1.5" className="fill-border" />
      <rect x="6" y="15" width="20" height="3.5" rx="1.75" className="fill-accent-warm/30 stroke-accent-warm" strokeWidth="0.75" />
      <rect x="6" y="20.5" width="14" height="2.5" rx="1.25" className="fill-border" />
      <rect x="32" y="14" width="12" height="9" rx="3" className="fill-brand/15 stroke-brand" strokeWidth="1.25" />
      <text x="38" y="19.5" textAnchor="middle" className="fill-brand text-[6px] font-semibold">
        82
      </text>
    </svg>
  );
}

/** A tiny 3-column kanban strip with 1–2 cards per column. */
export function KanbanStripIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 32" fill="none" className={cn("size-10", className)} aria-hidden>
      {[1, 17.5, 34].map((x, col) => (
        <g key={x}>
          <rect x={x} y="1" width="13" height="30" rx="3" className="fill-muted stroke-border" strokeWidth="1" />
          <rect
            x={x + 2}
            y="4.5"
            width="9"
            height="6"
            rx="1.5"
            className={col === 1 ? "fill-brand/20 stroke-brand" : "fill-card stroke-border"}
            strokeWidth="1"
          />
          {col !== 0 && (
            <rect
              x={x + 2}
              y="13"
              width="9"
              height="6"
              rx="1.5"
              className={col === 1 ? "fill-accent-warm/25 stroke-accent-warm" : "fill-card stroke-border"}
              strokeWidth="1"
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/** A broken/reconnected field-mapping glyph — schema drift. */
export function SchemaDriftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 32" fill="none" className={cn("size-10", className)} aria-hidden>
      <rect x="1" y="10" width="14" height="12" rx="3" className="fill-muted stroke-border" strokeWidth="1" />
      <rect x="33" y="10" width="14" height="12" rx="3" className="fill-muted stroke-border" strokeWidth="1" />
      <path d="M15 14 L21 14" className="stroke-border" strokeWidth="1.5" />
      <path d="M27 14 L33 14" className="stroke-accent-warm" strokeWidth="1.5" />
      <path d="M15 18 L21 18" className="stroke-border" strokeWidth="1.5" />
      <path d="M27 18 L33 18" className="stroke-border" strokeWidth="1.5" strokeDasharray="1.5 2" />
      <path d="M21 12.5 L27 15.5" className="stroke-accent-warm" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M21 15.5 L27 12.5" className="stroke-accent-warm" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="6" r="2.25" className="fill-accent-warm" />
      <path d="M24 8.25 L24 10.5" className="stroke-accent-warm" strokeWidth="1.25" />
    </svg>
  );
}
