"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Inbox, KanbanSquare, Settings2, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/leads", label: "Inbox", icon: Inbox },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/intelligence", label: "Intelligence", icon: TrendingUp },
];

const ADMIN_NAV = [
  { href: "/admin/datasets", label: "Datasets", icon: Database },
  { href: "/admin/sync", label: "Sync", icon: Settings2 },
  { href: "/admin/team", label: "Team", icon: Users },
];

/**
 * The nav item list itself, shared between the desktop sidebar and the mobile
 * drawer so they can never drift apart into two different navigations.
 * `onNavigate` closes the mobile drawer on link click; the desktop sidebar
 * doesn't pass one.
 */
export function NavContent({
  role,
  onNavigate,
}: {
  role: "admin" | "agent";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const item = (href: string, label: string, Icon: typeof Inbox) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {NAV.map((n) => item(n.href, n.label, n.icon))}

      {role === "admin" && (
        <>
          <div className="text-muted-foreground mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider uppercase">
            Admin
          </div>
          {ADMIN_NAV.map((n) => item(n.href, n.label, n.icon))}
        </>
      )}
    </nav>
  );
}
