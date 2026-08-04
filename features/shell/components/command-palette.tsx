"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Bookmark, Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Role, roleAtLeast } from "@/domain/auth/permissions";
import { ADMIN_NAV, MANAGER_NAV, NAV, OWNER_NAV, type NavItem } from "@/features/shell/nav-items";
import { useDatasetsQuery } from "@/features/datasets/queries";
import { useSavedViewsQuery } from "@/features/leads/queries";
import { formatCount } from "@/shared/format";

interface Group {
  heading: string;
  items: {
    key: string;
    label: string;
    hint?: string;
    icon: NavItem["icon"];
    onSelect: () => void;
  }[];
}

/**
 * ⌘K / Ctrl+K, global. Self-sufficient: owns its own open state and trigger
 * button (same "reads its own scope, no prop-drilled state" pattern as
 * `AppTopbar`'s dataset switcher) so it can be dropped into the topbar
 * without a provider higher up the tree.
 *
 * No per-lead deep link exists in this app (leads open in a client-state
 * sheet on `/leads`, not a route) — so a lead result jumps to a
 * name-filtered `/leads?q=…` rather than pretending to open the exact row.
 */
export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: datasets = [] } = useDatasetsQuery();
  const { data: savedViews = [] } = useSavedViewsQuery();

  /** Single entry point for opening/closing — resets query/selection as part of the same
   * event, not a separate `useEffect(() => setState(...))` reacting to `open` changing. */
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveIndex(0);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handleOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleOpenChange]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const navItems = useMemo(() => {
    const items: NavItem[] = [...NAV];
    if (roleAtLeast(role, "manager")) items.push(...MANAGER_NAV);
    if (roleAtLeast(role, "admin")) items.push(...ADMIN_NAV);
    if (role === "owner") items.push(...OWNER_NAV);
    items.push({ href: "/account", label: "Account", icon: Layers });
    return items;
  }, [role]);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (label: string) => q === "" || label.toLowerCase().includes(q);

    const result: Group[] = [];

    const pages = navItems.filter((n) => matches(n.label));
    if (pages.length > 0) {
      result.push({
        heading: "Go to",
        items: pages.map((n) => ({ key: `page-${n.href}`, label: n.label, icon: n.icon, onSelect: () => go(n.href) })),
      });
    }

    const matchedDatasets = datasets.filter((d) => matches(d.label));
    if (matchedDatasets.length > 0) {
      result.push({
        heading: "Datasets",
        items: matchedDatasets.slice(0, 6).map((d) => ({
          key: `dataset-${d.id}`,
          label: d.label,
          hint: `${formatCount(d.leadCount)} leads`,
          icon: Layers,
          onSelect: () => go(`/leads?datasetId=${d.id}`),
        })),
      });
    }

    const matchedViews = savedViews.filter((v) => matches(v.name));
    if (matchedViews.length > 0) {
      result.push({
        heading: "Saved searches",
        items: matchedViews.slice(0, 6).map((v) => {
          const params = new URLSearchParams(v.filters as Record<string, string>);
          if (v.sort) params.set("sort", v.sort);
          return {
            key: `view-${v.id}`,
            label: v.name,
            icon: Bookmark,
            onSelect: () => go(`/leads?${params.toString()}`),
          };
        }),
      });
    }

    if (q.length >= 2) {
      result.push({
        heading: "Leads",
        items: [
          {
            key: "lead-search",
            label: `Search leads for "${query.trim()}"`,
            icon: Search,
            onSelect: () => go(`/leads?q=${encodeURIComponent(query.trim())}`),
          },
        ],
      });
    }

    return result;
  }, [query, navItems, datasets, savedViews, go]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      flatItems[activeIndex]?.onSelect();
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger
        render={
          <button
            type="button"
            className="border-border bg-background text-muted-foreground hover:text-foreground flex h-8 min-w-0 max-w-72 flex-1 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors"
          >
            <Search className="size-3.5 shrink-0" aria-hidden />
            <span className="flex-1 truncate text-left">Search leads, datasets, settings…</span>
            <kbd className="border-border bg-muted hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
              ⌘K
            </kbd>
          </button>
        }
      />
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup className="fixed top-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl transition duration-150 ease-in-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="border-border flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search leads, datasets, settings…"
              className="h-11 flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {flatItems.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">Nothing matches &ldquo;{query}&rdquo;.</p>
            ) : (
              groups.map((group) => (
                <div key={group.heading} className="mb-1 last:mb-0">
                  <div className="text-muted-foreground px-2 py-1 text-[11px] font-medium tracking-wide uppercase">
                    {group.heading}
                  </div>
                  {group.items.map((item) => {
                    const index = flatItems.indexOf(item);
                    const active = index === activeIndex;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={item.onSelect}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm",
                          active ? "bg-accent text-accent-foreground" : "text-foreground",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && <span className="text-muted-foreground text-xs">{item.hint}</span>}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="border-border text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-[11px]">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
