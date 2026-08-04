"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/brand-mark";
import type { Role } from "@/domain/auth/permissions";
import type { NavExtras } from "@/features/shell/nav-items";
import { NavContent } from "./nav-content";

/**
 * Below `md` the sidebar (`AppSidebar`) is hidden entirely — this is what
 * replaces it, so the app has *some* way to navigate on a phone-sized
 * viewport. Same `NavContent` as the desktop sidebar, so the two can't list
 * different destinations.
 */
export function MobileNav({ role, navExtras }: { role: Role; navExtras: NavExtras }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation menu"
        className="md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-4" aria-hidden />
      </Button>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetTitle className="sr-only">Main navigation</SheetTitle>
        <div className="flex h-14 items-center gap-2 px-4">
          <BrandMark className="size-6" />
          <span className="text-sm font-semibold tracking-tight">DreamRue</span>
        </div>
        <NavContent role={role} navExtras={navExtras} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
