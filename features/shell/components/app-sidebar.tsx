import { BrandMark } from "@/components/brand/brand-mark";
import type { Role } from "@/domain/auth/permissions";
import { NavContent } from "./nav-content";

/** Desktop only (`md:flex`) — below that, `MobileNav` covers the same nav via a drawer. */
export function AppSidebar({ role }: { role: Role }) {
  return (
    <aside
      aria-label="Main navigation"
      className="bg-sidebar border-sidebar-border hidden w-56 shrink-0 flex-col border-r md:flex"
    >
      <div className="flex h-14 items-center gap-2 px-4">
        <BrandMark className="size-6" />
        <span className="text-sm font-semibold tracking-tight">DreamRue</span>
      </div>

      <NavContent role={role} />
    </aside>
  );
}
