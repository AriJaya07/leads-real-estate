"use client";

import { Button } from "@/components/ui/button";

/**
 * The floating box itself — `LeadCard`/`LeadRow` each render it inside a
 * `relative` anchor near the top lead's score, so it never has to guess a
 * position via a portal. One tooltip, not a tour: it only ever appears once,
 * around the single top-ranked lead, dismissed for good via localStorage in
 * the parent `LeadInbox` (see `hooks/use-local-storage-value.ts`).
 */
export function FirstLeadTooltip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="tooltip"
      onClick={(event) => event.stopPropagation()}
      className="bg-popover text-popover-foreground border-border absolute top-full left-0 z-20 mt-2 w-72 rounded-lg border p-3 shadow-md"
    >
      <p className="text-sm font-semibold">This is why it&apos;s first</p>
      <p className="text-muted-foreground mt-1 text-sm">
        Priority combines stated intent, budget clarity and how long nobody has replied. Open a lead to see its
        reasons.
      </p>
      <Button size="sm" className="mt-2" onClick={onDismiss}>
        Got it
      </Button>
    </div>
  );
}
