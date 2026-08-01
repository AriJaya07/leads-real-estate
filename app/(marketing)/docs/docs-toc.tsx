"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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
