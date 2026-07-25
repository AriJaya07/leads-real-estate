import { cn } from "@/lib/utils";

/**
 * Custom mark: a radar sweep over an island silhouette. Uses `currentColor` so it
 * inherits theme colour everywhere it appears.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="DreamRue"
      className={cn("text-primary", className)}
    >
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeOpacity="0.25" />
      <circle cx="16" cy="16" r="9.5" stroke="currentColor" strokeOpacity="0.35" />
      <circle cx="16" cy="16" r="4.5" stroke="currentColor" strokeOpacity="0.5" />
      <path
        d="M16 16 L16 1.5 A14.5 14.5 0 0 1 28.6 9"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="none"
      />
      <path d="M16 16 L28.6 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="22" cy="20" r="2.5" fill="currentColor" />
    </svg>
  );
}
