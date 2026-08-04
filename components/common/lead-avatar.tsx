import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  buyer: "bg-intent-buyer/15 text-intent-buyer",
  seller: "bg-intent-seller/15 text-intent-seller",
  agent: "bg-intent-agent/15 text-intent-agent",
  broker: "bg-intent-broker/15 text-intent-broker",
  investor: "bg-intent-investor/15 text-intent-investor",
  other: "bg-intent-other/15 text-intent-other",
  unknown: "bg-intent-other/15 text-intent-other",
};

const SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "size-7 text-[10px]",
  md: "size-[30px] text-[11px]",
  lg: "size-11 text-sm",
};

function initialsFrom(name: string | null): string {
  const source = (name ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * Colour-by-intent initials avatar — the same visual identity the marketing
 * hero mockup and the design doc's inbox rows use, tied to `IntentBadge`'s
 * palette (not a name hash) so a buyer's avatar and their intent pill always
 * agree. `aria-hidden`: the name and intent are both already announced
 * as text right next to it, so this is decorative.
 */
export function LeadAvatar({
  name,
  intent,
  size = "md",
  className,
}: {
  name: string | null;
  intent: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold",
        SIZE[size],
        TONE[intent] ?? TONE.other,
        className,
      )}
    >
      {initialsFrom(name)}
    </span>
  );
}
