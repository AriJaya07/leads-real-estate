// src/components/common/empty-state.tsx
import { SearchX } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-16 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <p className="text-lg font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}