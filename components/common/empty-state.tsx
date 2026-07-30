// src/components/common/empty-state.tsx
import type { ReactNode } from "react";
import { SearchX } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  /** Optional next-step CTA (e.g. a link to go fix the "empty" part of "empty state"). */
  action?: ReactNode;
}) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-16 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <p className="text-lg font-medium">{title}</p>
      {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
      {action}
    </div>
  );
}