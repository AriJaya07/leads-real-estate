"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Left nav for the docs shell, shared by `/docs`, `/docs/guide` and
 * `/docs/api` so the three pages read as one section instead of three
 * one-off layouts. The four API items below anchor-link into `/docs/api`'s
 * own sections (same single-page scroll-spy pattern as that page's
 * `DocsToc`) rather than being separate routes — there's one API doc, not
 * five. `Quickstart` has no route yet — still an honest placeholder, same
 * pattern as the "planned" tags on `/pricing`.
 */
const DOCS_NAV = [
  {
    heading: "Getting started",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "Quickstart" },
      { label: "User guide", href: "/docs/guide" },
    ],
  },
  {
    heading: "API",
    items: [
      { label: "Authentication", href: "/docs/api" },
      { label: "Rate limits", href: "/docs/api#rate-limits" },
      { label: "Leads endpoint", href: "/docs/api#leads-endpoint" },
      { label: "Webhooks", href: "/docs/api#webhooks" },
      { label: "Security practices", href: "/docs/api#security-practices" },
    ],
  },
] as const;

export function DocsNav({ active }: { active: string }) {
  return (
    <nav aria-label="Docs" className="hidden shrink-0 lg:block lg:w-[200px]">
      {DOCS_NAV.map((group) => (
        <div key={group.heading} className="mb-6">
          <div className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
            {group.heading}
          </div>
          <div className="flex flex-col gap-1 text-sm">
            {group.items.map((item) => {
              const isActive = item.label === active;
              const className = isActive ? "text-brand font-medium" : "text-muted-foreground hover:text-foreground";
              return "href" in item ? (
                <Link key={item.label} href={item.href} className={className}>
                  {item.label}
                </Link>
              ) : (
                <span key={item.label} className={className}>
                  {item.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

type TocEntry = { id: string; label: string };

/** Sticky, scroll-spied table of contents — what makes a docs page read as documentation. */
export function DocsToc({ entries }: { entries: readonly TocEntry[] }) {
  const [activeId, setActiveId] = useState<string>(entries[0]?.id ?? "");

  useEffect(() => {
    const headings = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (observedEntries) => {
        const visible = observedEntries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );

    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [entries]);

  return (
    <nav className="sticky top-24 hidden shrink-0 lg:block lg:w-48" aria-label="On this page">
      <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">On this page</p>
      <ul className="border-border flex flex-col gap-1 border-l">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className={cn(
                "-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors",
                activeId === entry.id
                  ? "border-brand text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
