"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, HelpCircle, Layers, LogOut, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { NotificationPanel } from "./notification-panel";
import { cn } from "@/lib/utils";
import { formatCount } from "@/shared/format";
import { signOut } from "@/application/auth/login.actions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDatasetsQuery } from "@/features/datasets/queries";
import type { Role } from "@/domain/auth/permissions";

/**
 * The global dataset scope. This is what replaces switching APIFY_DATASET_ID:
 * every page reacts to it, and it lives in the URL so a filtered view is
 * shareable.
 *
 * Self-sufficient like LeadInbox/LeadStatsRow: fetches through
 * `useDatasetsQuery`, hydrated on first paint by the server prefetch in
 * app/(app)/layout.tsx, and switches scope via shallow routing so choosing a
 * dataset never forces a full RSC re-navigation of the shell.
 */
export function AppTopbar({
  userEmail,
  role,
}: {
  userEmail: string;
  role: Role;
}) {
  const router = useRouter();
  const { searchParams, setParams } = useUrlFilters();
  const { data: datasets = [] } = useDatasetsQuery();
  const datasetId = searchParams.get("datasetId");
  const setDatasetId = (id: string | null) =>
    setParams((next) => (id ? next.set("datasetId", id) : next.delete("datasetId")));

  const active = datasets.find((d) => d.id === datasetId);
  const totalLeads = datasets.reduce((sum, d) => sum + d.leadCount, 0);

  return (
    <header className="border-border bg-background/80 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:gap-3 sm:px-4">
      <MobileNav role={role} />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="min-w-0 gap-1.5 sm:gap-2">
              <Layers className="size-3.5 shrink-0" aria-hidden />
              <span className="max-w-24 truncate sm:max-w-52">{active?.label ?? "All datasets"}</span>
              <span className="text-muted-foreground hidden font-mono text-xs tabular-nums sm:inline">
                {formatCount(active?.leadCount ?? totalLeads)}
              </span>
              <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-80">
          {/* Base UI requires GroupLabel to be inside a Group — a bare Label
              throws at open time (Base UI error #31), not at build time. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Dataset scope</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDatasetId(null)}>
              <Check className={cn("size-3.5", datasetId ? "opacity-0" : "opacity-100")} />
              <span className="flex-1">All datasets</span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {formatCount(totalLeads)}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {datasets.map((dataset) => (
              <DropdownMenuItem key={dataset.id} onClick={() => setDatasetId(dataset.id)}>
                <Check
                  className={cn("size-3.5", datasetId === dataset.id ? "opacity-100" : "opacity-0")}
                />
                <span className="flex-1 truncate">{dataset.label}</span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatCount(dataset.leadCount)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <CommandPalette role={role} />
      <div className="flex-1" />

      <Button variant="ghost" size="icon" aria-label="Help and documentation" render={<Link href="/docs/guide" />}>
        <HelpCircle className="size-4" aria-hidden />
      </Button>
      <NotificationPanel />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Account">
              <UserIcon className="size-4" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate font-normal">{userEmail}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/account")}>Account</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void signOut().then(() => router.push("/login"));
              }}
            >
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
