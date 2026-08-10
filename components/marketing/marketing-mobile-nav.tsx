"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/brand-mark";

type NavLink = { href: string; label: string };

function NavSection({
  label,
  links,
  onNavigate,
}: {
  label: string;
  links: readonly NavLink[];
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-muted-foreground px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">
        {label}
      </div>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className="text-foreground/90 hover:bg-muted hover:text-foreground rounded-lg px-3 py-2.5 text-[15px] transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Below `md` the desktop nav (dropdowns + inline links) is hidden entirely —
 * this drawer is what replaces it, mirroring the same links so mobile users
 * never lose access to Product/Resources/Pricing/Roadmap or auth actions.
 */
export function MarketingMobileNav({
  productLinks,
  resourceLinks,
}: {
  productLinks: readonly NavLink[];
  resourceLinks: readonly NavLink[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
      <SheetContent side="right" className="flex w-full max-w-xs flex-col gap-0 p-0 sm:max-w-sm">
        <SheetTitle className="sr-only">Main navigation</SheetTitle>
        <div className="border-border flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <BrandMark className="size-7" />
          <span className="text-sm font-semibold tracking-tight">AveronAi</span>
        </div>

        <nav aria-label="Main" className="flex flex-1 flex-col overflow-y-auto px-2 py-2">
          <NavSection label="Product" links={productLinks} onNavigate={close} />
          <NavSection label="Resources" links={resourceLinks} onNavigate={close} />

          <div className="border-border mt-2 flex flex-col gap-0.5 border-t pt-2">
            <Link
              href="/pricing"
              onClick={close}
              className="text-foreground/90 hover:bg-muted hover:text-foreground rounded-lg px-3 py-2.5 text-[15px] transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/roadmap"
              onClick={close}
              className="text-foreground/90 hover:bg-muted hover:text-foreground rounded-lg px-3 py-2.5 text-[15px] transition-colors"
            >
              Roadmap
            </Link>
          </div>
        </nav>

        <div className="border-border flex flex-col gap-2 border-t p-4">
          <Button variant="outline" render={<Link href="/login" onClick={close} />}>
            Sign in
          </Button>
          <Button render={<Link href="/signup" onClick={close} />}>Get started</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
