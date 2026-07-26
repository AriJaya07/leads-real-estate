import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  buyer: "Buyer",
  seller: "Seller",
  agent: "Agent",
  broker: "Broker",
  investor: "Investor",
  other: "Other",
  unknown: "Unknown",
};

const DOT: Record<string, string> = {
  buyer: "bg-intent-buyer",
  seller: "bg-intent-seller",
  agent: "bg-intent-agent",
  broker: "bg-intent-broker",
  investor: "bg-intent-investor",
  other: "bg-intent-other",
  unknown: "bg-intent-other",
};

/**
 * Colour plus the word. Intent is never encoded by hue alone — colourblind
 * readers, printouts and forced-colors modes all need the label.
 */
export function IntentBadge({ intent, className }: { intent: string; className?: string }) {
  return (
    <span
      className={cn(
        "border-border/70 text-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[intent] ?? DOT.other)} aria-hidden />
      {LABELS[intent] ?? intent}
    </span>
  );
}
