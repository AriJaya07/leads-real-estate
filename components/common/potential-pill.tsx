import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  high_potential: "bg-[var(--health-ok-bg)] text-[var(--health-ok-fg)]",
  medium_potential: "bg-[var(--health-warn-bg)] text-[var(--health-warn-fg)]",
  low_potential: "bg-[var(--health-bad-bg)] text-[var(--health-bad-fg)]",
};

const LABELS: Record<string, string> = {
  high_potential: "High potential",
  medium_potential: "Medium potential",
  low_potential: "Low potential",
};

/** Same shape as `HealthPill`/`ScrapeStatusPill`, over `LeadPotential` from domain/scoring/lead-validation.ts. */
export function PotentialPill({ potential, className }: { potential: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[potential] ?? TONES.low_potential,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {LABELS[potential] ?? potential}
    </span>
  );
}
