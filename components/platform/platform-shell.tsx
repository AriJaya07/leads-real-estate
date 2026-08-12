import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "tenants", label: "Tenants", href: "/platform/tenants" },
  { id: "categories", label: "Categories", href: "/platform/categories" },
  { id: "analytics", label: "Platform Analytics", href: "/platform/analytics" },
  { id: "connectors", label: "Connector Health", href: "/platform/connectors" },
  { id: "billing", label: "Platform Billing", href: "/platform/billing" },
] as const;

export type PlatformNavId = (typeof NAV_ITEMS)[number]["id"];

/**
 * Deliberately unmistakable from the tenant app shell (`AppSidebar`) — dark,
 * hardcoded colors rather than the theme's `--sidebar` tokens, so it can
 * never accidentally converge with the light tenant look if that token ever
 * changes. See the "Owner vs Super Admin" design note this implements: a
 * platform operator should never be able to mistake this for a tenant's own
 * view, at a glance, on a screenshot, or half-asleep at 2am.
 */
export function PlatformShell({
  active,
  userLabel,
  children,
}: {
  active: PlatformNavId;
  /** e.g. "Joko · Super Admin" — the signed-in platform admin, shown in the sidebar footer. */
  userLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 px-3 py-4">
        <div className="flex items-center gap-2 px-2 pb-4">
          <BrandMark className="size-5 text-white" />
          <span className="text-sm font-semibold text-white">AveronAi</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">PLATFORM</span>
        </div>
        <nav className="flex flex-col gap-0.5 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "rounded-md px-2.5 py-1.5 transition-colors",
                active === item.id
                  ? "bg-white/10 font-medium text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <Link
          href="/leads"
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
        >
          <ArrowLeft className="size-3.5 shrink-0" aria-hidden />
          Back to your workspace
        </Link>
        <div className="mt-1 flex items-center gap-2 border-t border-zinc-800 px-2 pt-3">
          <div className="flex size-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-white">
            {userLabel.slice(0, 2).toUpperCase()}
          </div>
          <span className="text-xs text-zinc-300">{userLabel}</span>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto bg-background">{children}</main>
    </div>
  );
}
