"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type Role, roleAtLeast } from "@/domain/auth/permissions";
import { ADMIN_NAV, MANAGER_NAV, NAV, OWNER_NAV, type NavExtras } from "@/features/shell/nav-items";
import { OnboardingChecklist } from "@/features/leads/components/onboarding-checklist";

const SYNC_TONE_DOT: Record<NonNullable<NavExtras["syncTone"]>, string> = {
  ok: "bg-[var(--health-ok-fg)]",
  warn: "bg-[var(--health-warn-fg)]",
  bad: "bg-[var(--health-bad-fg)]",
};

const SYNC_TONE_LABEL: Record<NonNullable<NavExtras["syncTone"]>, string> = {
  ok: "Healthy",
  warn: "Stale",
  bad: "Needs attention",
};

/** A plain, unlabeled rule between nav groups — the "Admin" section header only introduces the first group. */
function NavDivider() {
  return <div className="bg-sidebar-border my-2 h-px shrink-0" aria-hidden />;
}

/**
 * The nav item list itself, shared between the desktop sidebar and the mobile
 * drawer so they can never drift apart into two different navigations.
 * `onNavigate` closes the mobile drawer on link click; the desktop sidebar
 * doesn't pass one. `navExtras` is the live data (Inbox count, Sync health,
 * onboarding progress) computed once per request in app/(app)/layout.tsx —
 * see `NavExtras`'s own doc comment for why it isn't fetched here.
 */
export function NavContent({
  role,
  navExtras,
  onNavigate,
}: {
  role: Role;
  navExtras: NavExtras;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const item = (href: string, label: string, Icon: typeof Inbox, trailing?: React.ReactNode) => {
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
        <span className="flex-1 truncate">{label}</span>
        {trailing}
      </Link>
    );
  };

  const inboxBadge =
    navExtras.inboxCount > 0 ? (
      <span className="text-muted-foreground shrink-0 font-mono text-[10.5px] tabular-nums">
        {navExtras.inboxCount > 99 ? "99+" : navExtras.inboxCount}
      </span>
    ) : undefined;

  const syncDot = navExtras.syncTone ? (
    <span
      role="img"
      aria-label={SYNC_TONE_LABEL[navExtras.syncTone]}
      className={cn("size-1.5 shrink-0 rounded-full", SYNC_TONE_DOT[navExtras.syncTone])}
    />
  ) : undefined;

  const newBadge = (
    <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[9px] font-semibold tracking-wide">
      New
    </Badge>
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-2">
      <nav className="flex flex-col gap-1">
        {NAV.map((n) => item(n.href, n.label, n.icon, n.href === "/leads" ? inboxBadge : undefined))}

        {roleAtLeast(role, "manager") && (
          <>
            <div className="text-muted-foreground mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider uppercase">
              Admin
            </div>
            {MANAGER_NAV.map((n) => item(n.href, n.label, n.icon, n.href === "/admin/sync" ? syncDot : undefined))}

            {roleAtLeast(role, "admin") && (
              <>
                <NavDivider />
                {ADMIN_NAV.map((n) =>
                  item(n.href, n.label, n.icon, n.href === "/admin/api-keys" ? newBadge : undefined),
                )}
              </>
            )}

            {role === "owner" && (
              <>
                <NavDivider />
                {OWNER_NAV.map((n) => item(n.href, n.label, n.icon))}
              </>
            )}
          </>
        )}
      </nav>

      <div className="flex-1" />

      {/* Pinned to the sidebar bottom, not inline on the Inbox page — a
          setup nudge belongs to the shell, not to any one page's content. */}
      <div className="pt-3">
        <OnboardingChecklist hasSource={navExtras.hasSource} hasTeammates={navExtras.hasTeammates} />
      </div>
    </div>
  );
}
