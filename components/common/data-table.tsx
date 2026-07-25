import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The bordered, horizontally-scrollable table shell repeated verbatim across
 * every admin/data table (leads, datasets, team) before this existed. `minWidth`
 * is a Tailwind arbitrary-value class (`min-w-[900px]`) since each table's
 * columns need a different floor before horizontal scroll kicks in.
 */
export function DataTable({
  minWidth,
  className,
  children,
  ...props
}: {
  minWidth: string;
  className?: string;
  children: ReactNode;
} & ComponentProps<"div">) {
  return (
    <div className={cn("border-border overflow-x-auto rounded-xl border", className)} {...props}>
      <table className={cn("w-full text-sm", minWidth)}>{children}</table>
    </div>
  );
}

/** The header row shape every one of those tables also repeated verbatim. */
export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-muted/50 text-muted-foreground">
      <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">{children}</tr>
    </thead>
  );
}
