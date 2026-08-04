import { cn } from "@/lib/utils";

type IconProps = { className?: string };

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
