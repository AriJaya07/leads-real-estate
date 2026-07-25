"use client";

import { useQueryState } from "nuqs";
import { Check, ChevronDown, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { formatCount } from "@/shared/format";

export interface DatasetOption {
  id: string;
  label: string;
  leadCount: number;
  health: string;
}

/**
 * The global dataset scope. This is what replaces switching APIFY_DATASET_ID:
 * every page reacts to it, and it lives in the URL so a filtered view is
 * shareable.
 */
export function AppTopbar({ datasets }: { datasets: DatasetOption[] }) {
  const [datasetId, setDatasetId] = useQueryState("datasetId", {
    history: "push",
    shallow: false,
  });

  const active = datasets.find((d) => d.id === datasetId);
  const totalLeads = datasets.reduce((sum, d) => sum + d.leadCount, 0);

  return (
    <header className="border-border bg-background/80 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="gap-2">
              <Layers className="size-3.5" aria-hidden />
              <span className="max-w-52 truncate">{active?.label ?? "All datasets"}</span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {formatCount(active?.leadCount ?? totalLeads)}
              </span>
              <ChevronDown className="size-3.5 opacity-60" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>Dataset scope</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void setDatasetId(null)}>
            <Check className={cn("size-3.5", datasetId ? "opacity-0" : "opacity-100")} />
            <span className="flex-1">All datasets</span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {formatCount(totalLeads)}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {datasets.map((dataset) => (
            <DropdownMenuItem key={dataset.id} onClick={() => void setDatasetId(dataset.id)}>
              <Check
                className={cn("size-3.5", datasetId === dataset.id ? "opacity-100" : "opacity-0")}
              />
              <span className="flex-1 truncate">{dataset.label}</span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {formatCount(dataset.leadCount)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />
      <ThemeToggle />
    </header>
  );
}
