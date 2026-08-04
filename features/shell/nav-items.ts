import {
  BarChart3,
  Bell,
  CreditCard,
  Database,
  Download,
  Inbox,
  KanbanSquare,
  KeyRound,
  Settings2,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Inbox;
}

/**
 * Live, request-scoped data `NavContent` needs beyond the static route list
 * above — computed once per request in `app/(app)/layout.tsx` and handed down
 * to both nav surfaces (desktop sidebar, mobile drawer) so neither re-fetches
 * its own copy.
 */
export interface NavExtras {
  /** Leads still in `new` status — the Inbox item's live count badge. */
  inboxCount: number;
  /** `null` when there are no datasets yet — the Sync item shows no dot rather than a false "healthy". */
  syncTone: "ok" | "warn" | "bad" | null;
  hasSource: boolean;
  hasTeammates: boolean;
}

/**
 * Single source of truth for "what pages exist and what icon represents
 * them" — `nav-content.tsx` (sidebar/mobile drawer) and `command-palette.tsx`
 * (⌘K "Go to") both render off these same arrays, so the two navigation
 * surfaces can't drift into listing different destinations.
 */
export const NAV: NavItem[] = [
  { href: "/leads", label: "Inbox", icon: Inbox },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/intelligence", label: "Intelligence", icon: TrendingUp },
];

/** Manage projects and data — visible to manager and above. */
export const MANAGER_NAV: NavItem[] = [
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/collection", label: "Collect data", icon: Download },
  { href: "/admin/datasets", label: "Datasets", icon: Database },
  { href: "/admin/sync", label: "Sync", icon: Settings2 },
];

/** Manage users and settings — visible to admin (and owner) only. */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/team", label: "Team", icon: Users },
  { href: "/admin/alerts", label: "Alerts", icon: Bell },
  { href: "/admin/automation", label: "Automation", icon: Zap },
  { href: "/admin/api-keys", label: "API keys", icon: KeyRound },
];

/** Spend decisions — visible to owner only. */
export const OWNER_NAV: NavItem[] = [{ href: "/admin/billing", label: "Billing", icon: CreditCard }];
