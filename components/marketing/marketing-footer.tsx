import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/solutions/villa-property-agencies", label: "Solutions" },
      { href: "/integrations", label: "Integrations" },
      { href: "/pricing", label: "Pricing" },
      { href: "/roadmap", label: "Roadmap" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/docs/guide", label: "User guide" },
      { href: "/docs/api", label: "API reference" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 md:flex-row md:justify-between">
        <div className="flex flex-col gap-3">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="size-7" />
            <span className="text-sm font-semibold tracking-tight">DreamRue</span>
          </Link>
          <p className="text-muted-foreground max-w-xs text-sm">
            Buyer-intent lead intelligence for Bali property teams.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{column.heading}</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-muted-foreground hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-border border-t">
        <p className="text-muted-foreground mx-auto max-w-6xl px-4 py-6 text-xs sm:px-6">
          © DreamRue. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
