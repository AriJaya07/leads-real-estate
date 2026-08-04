"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRODUCT_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/solutions/villa-property-agencies", label: "Solutions" },
  { href: "/integrations", label: "Integrations" },
  { href: "/pricing", label: "Pricing" },
  { href: "/roadmap", label: "Roadmap" },
] as const;

const RESOURCE_LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/docs/guide", label: "Guide" },
  { href: "/docs/api", label: "API reference" },
  { href: "/blog", label: "Blog" },
  { href: "/faq", label: "FAQ" },
] as const;

function NavDropdown({ label, links }: { label: string; links: readonly { href: string; label: string }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            {label}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-48">
        {links.map((link) => (
          <DropdownMenuLinkItem key={link.href} render={<Link href={link.href} />}>
            {link.label}
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MarketingHeader() {
  return (
    <header className="border-border sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="size-7" />
          <span className="text-sm font-semibold tracking-tight">DreamRue</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          <NavDropdown label="Product" links={PRODUCT_LINKS} />
          <NavDropdown label="Resources" links={RESOURCE_LINKS} />
        </nav>

        <div className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Button render={<Link href="/signup" />} size="sm">
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}
