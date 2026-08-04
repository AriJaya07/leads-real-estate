"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Role, roleAtLeast } from "@/domain/auth/permissions";
import { ADMIN_NAV, MANAGER_NAV, NAV, OWNER_NAV } from "@/features/shell/nav-items";

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
  role: Role;
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

      {roleAtLeast(role, "manager") && (
        <>
          <div className="text-muted-foreground mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider uppercase">
            Admin
          </div>
          {MANAGER_NAV.map((n) => item(n.href, n.label, n.icon))}
          {roleAtLeast(role, "admin") && ADMIN_NAV.map((n) => item(n.href, n.label, n.icon))}
          {role === "owner" && OWNER_NAV.map((n) => item(n.href, n.label, n.icon))}
        </>
      )}
    </nav>
  );
}
