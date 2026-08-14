"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, MessageCircle, Phone, Star, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { RelativeTime } from "@/components/common/relative-time";
import { IntentBadge } from "@/components/common/intent-badge";
import { ScoreBadge, ScoreReasons } from "@/components/common/score-badge";
import { PotentialPill } from "@/components/common/potential-pill";
import { LeadAvatar } from "@/components/common/lead-avatar";
import { LeadFilterBar } from "./lead-filter-bar";
import { SavedSearchesBar } from "./saved-searches-bar";
import { FirstLeadTooltip } from "./first-lead-tooltip";
import {
  markContacted,
  assignLead,
  toggleBookmark,
  bulkAssignLeads,
  bulkSetStatus,
  bulkMarkContacted,
  bulkAddTag,
} from "@/application/leads/lead.actions";
import { setLocalStorageValue, useLocalStorageValue } from "@/hooks/use-local-storage-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useServerAction } from "@/hooks/use-server-action";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { useLeadFacetsQuery, useLeadsQuery, useSavedViewsQuery } from "@/features/leads/queries";
import { parseLeadFilters, type LeadFilters } from "@/application/leads/filters.schema";
import { FieldLabelsProvider, useFieldLabels } from "@/features/leads/vertical-context";
import type { VerticalFieldLabels } from "@/domain/verticals/catalog";
import { LEAD_STATUSES, leadStatusLabel } from "@/application/leads/lead-status";
import type { LeadListItem, LeadPage } from "@/application/leads/lead-queries";
import type { FacetDescriptor } from "@/application/leads/facets";
import { primaryLeadScore } from "@/domain/lead/ranking";
import { cn } from "@/lib/utils";
import { formatCompact, formatCount } from "@/shared/format";

/**
 * Code-split: renders `null` until a lead is selected, so its JS (a large
 * Sheet, status buttons, notes textarea) has no reason to ship in the same
 * chunk as the list that's needed for every /leads visit. `ssr: false`
 * because it's always closed on first paint — no server-rendered markup to
 * lose.
 */
const LeadDetailSheet = dynamic(
  () => import("./lead-detail-sheet").then((mod) => mod.LeadDetailSheet),
  { ssr: false },
);

function budgetLabel(lead: LeadListItem): string {
  if (lead.budgetMin === null && lead.budgetMax === null) return "—";
  const currency = lead.budgetCurrency ?? "";
  if (lead.budgetMin === lead.budgetMax) return `${currency} ${formatCompact(lead.budgetMin ?? 0)}`;
  return `${currency} ${formatCompact(lead.budgetMin ?? 0)}–${formatCompact(lead.budgetMax ?? 0)}`;
}

function countActiveFilters(filters: LeadFilters): number {
  let count = 0;
  if (filters.q) count += 1;
  count += filters.leadType.length + filters.status.length;
  count += filters.propertyTypes.length + filters.locations.length + filters.groups.length;
  count += filters.sourceIds.length + filters.dataQuality.length;
  if (filters.minBuyerScore !== undefined) count += 1;
  if (filters.minLeadScore !== undefined) count += 1;
  if (filters.hasContact) count += 1;
  if (filters.bookmarked) count += 1;
  if (filters.showHidden) count += 1;
  if (filters.collectedAfter) count += 1;
  if (filters.collectedBefore) count += 1;
  count += Object.keys(filters.attr).length;
  return count;
}

type ContactChannel = "whatsapp" | "phone" | "post";

const FIRST_LEAD_TOOLTIP_DISMISSED_KEY = "averonai:first-lead-tooltip:dismissed";
/** Same "high" cutoff `components/common/score-badge.tsx`'s internal `tone()` uses — a middling top lead gets no tooltip. */
const FIRST_LEAD_TOOLTIP_SCORE_THRESHOLD = 70;

/**
 * Hand-rolled rather than a shared `components/ui/checkbox.tsx` — no such
 * primitive exists yet and a single 15px selection square doesn't warrant
 * introducing one. `role="checkbox"`/`aria-checked` keep it screen-reader
 * correct without pulling in a new dependency for this one use.
 */
function SelectCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: (event: React.MouseEvent) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked ? "bg-[var(--brand)] border-[var(--brand)] text-white" : "border-border bg-background hover:border-muted-foreground",
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" aria-hidden>
          <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/**
 * Memoized: `page.items` keeps a stable reference between renders that don't
 * change the underlying query result (e.g. `isFetching`/`selected` toggling
 * elsewhere in `LeadInbox`), so as long as `lead` and the callbacks stay
 * referentially stable, every row can skip re-rendering on those changes —
 * see `contact`'s `useCallback` in `LeadInbox` for the callback half of that.
 */
const ContactActions = memo(function ContactActions({
  lead,
  onContact,
}: {
  lead: LeadListItem;
  onContact: (lead: LeadListItem, channel: ContactChannel) => void;
}) {
  const externalUrl = lead.primaryAppearance?.externalUrl ?? null;
  if (!lead.contact.whatsapp && !lead.contact.phone && !externalUrl) {
    return <span className="text-muted-foreground text-xs">no contact</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {lead.contact.whatsapp && (
        <Button
          size="icon"
          variant="outline"
          aria-label="Contact on WhatsApp"
          onClick={() => onContact(lead, "whatsapp")}
        >
          <MessageCircle className="size-3.5" aria-hidden />
        </Button>
      )}
      {lead.contact.phone && (
        <Button
          size="icon"
          variant="outline"
          aria-label="Copy phone number"
          onClick={() => {
            void navigator.clipboard.writeText(lead.contact.phone!).then(() => toast.success("Copied"));
            void onContact(lead, "phone");
          }}
        >
          <Phone className="size-3.5" aria-hidden />
        </Button>
      )}
      {externalUrl && (
        <Button
          size="icon"
          variant="outline"
          aria-label="Open original post"
          onClick={() => onContact(lead, "post")}
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </Button>
      )}
    </div>
  );
});

/**
 * Used both as the forced mobile layout (a fixed-column table can't fit a
 * narrow viewport) and as the explicit "cards" view at any width — `filters.view`
 * already had a `"cards"` option in the schema with nothing rendering it.
 *
 * Memoized for the same reason as `ContactActions`: `onSelect` is `setSelected`
 * (a stable `useState` dispatch) and `onContact` is `contact`, stabilized via
 * `useCallback` below, so a row only re-renders when its own `lead` changes.
 */
const LeadCard = memo(function LeadCard({
  lead,
  onSelect,
  onContact,
  highlightFirst = false,
  onDismissHighlight,
  selected = false,
  onToggleSelect,
  rowRef,
  onRowKeyDown,
}: {
  lead: LeadListItem;
  onSelect: (lead: LeadListItem) => void;
  onContact: (lead: LeadListItem, channel: ContactChannel) => void;
  /** True only for the single top-ranked lead, and only while the first-lead tooltip hasn't been dismissed. */
  highlightFirst?: boolean;
  onDismissHighlight?: () => void;
  selected?: boolean;
  onToggleSelect?: (lead: LeadListItem, event: React.MouseEvent) => void;
  rowRef?: (el: HTMLElement | null) => void;
  /** Keyboard-triage shortcuts (j/k navigate, e/a/s/x act) — falls back to Enter/Space-opens-sheet alone when absent. */
  onRowKeyDown?: (event: React.KeyboardEvent) => void;
}) {
  const appearance = lead.primaryAppearance;
  const fieldLabels = useFieldLabels();
  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(lead)}
      onKeyDown={(event) => {
        if (onRowKeyDown) {
          onRowKeyDown(event);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(lead);
        }
      }}
      className={cn(
        "border-border bg-card hover:bg-accent/40 focus-visible:ring-ring relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors outline-none focus-visible:ring-2",
        lead.status !== "new" && "opacity-70",
        highlightFirst && "ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-background",
        selected && "ring-2 ring-[var(--brand)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {onToggleSelect && (
            <SelectCheckbox
              checked={selected}
              onToggle={(event) => onToggleSelect(lead, event)}
              label={`Select ${lead.name ?? "lead"}`}
            />
          )}
          <ScoreBadge score={primaryLeadScore(lead)} />
          <IntentBadge intent={lead.leadType} />
          <PotentialPill potential={lead.dataQualityTier} />
          {lead.bookmarked && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Favorite" />}
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">
          <RelativeTime value={lead.latestAppearanceAt} />
        </span>
      </div>

      <div className="flex items-start gap-2.5">
        <LeadAvatar name={lead.name} intent={lead.leadType} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{lead.name ?? "Unknown"}</span>
            {lead.appearanceCount > 1 && (
              <span className="text-muted-foreground text-xs">seen {lead.appearanceCount}×</span>
            )}
            {lead.status !== "new" && (
              <span className="bg-muted rounded px-1.5 py-0.5 text-[11px]">
                {leadStatusLabel(lead.status)}
              </span>
            )}
          </div>
          {/* The buyer's own words, not a paraphrase — quoted-language treatment
              (font-serif italic) matches the design's rule that this is the one
              place Fraunces shows up outside marketing. */}
          <p className="text-muted-foreground font-serif mt-1 line-clamp-2 text-sm italic">
            {appearance?.listingTitle ? `${appearance.listingTitle} — ` : ""}
            {appearance?.body || "(no text)"}
          </p>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span>{lead.propertyTypes.length ? lead.propertyTypes.join(", ") : `Any ${fieldLabels.categoryField.toLowerCase()}`}</span>
        <span>{lead.locations.length ? lead.locations.join(", ") : `Any ${fieldLabels.locations.toLowerCase()}`}</span>
        <span className="font-mono tabular-nums">{budgetLabel(lead)}</span>
      </div>

      <ScoreReasons reasons={appearance?.scoreReasons ?? []} />

      <div className="mt-1 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-muted-foreground flex items-center gap-2 text-[11px]">
          <span className="font-mono tabular-nums">confidence {lead.confidenceScore}</span>
          <span>· {lead.assignedToName ?? "Unassigned"}</span>
        </span>
        <ContactActions lead={lead} onContact={onContact} />
      </div>

      {highlightFirst && onDismissHighlight && <FirstLeadTooltip onDismiss={onDismissHighlight} />}
    </div>
  );
});

/** Desktop table row. Memoized for the same reason as `LeadCard`. */
const LeadRow = memo(function LeadRow({
  lead,
  onSelect,
  onContact,
  highlightFirst = false,
  onDismissHighlight,
  selected = false,
  onToggleSelect,
  rowRef,
  onRowKeyDown,
}: {
  lead: LeadListItem;
  onSelect: (lead: LeadListItem) => void;
  onContact: (lead: LeadListItem, channel: ContactChannel) => void;
  /** True only for the single top-ranked lead, and only while the first-lead tooltip hasn't been dismissed. */
  highlightFirst?: boolean;
  onDismissHighlight?: () => void;
  selected?: boolean;
  onToggleSelect?: (lead: LeadListItem, event: React.MouseEvent) => void;
  rowRef?: (el: HTMLElement | null) => void;
  /** Keyboard-triage shortcuts (j/k navigate, e/a/s/x act) — see `LeadCard`'s twin prop. */
  onRowKeyDown?: (event: React.KeyboardEvent) => void;
}) {
  const appearance = lead.primaryAppearance;
  return (
    <tr
      ref={rowRef as React.Ref<HTMLTableRowElement>}
      tabIndex={0}
      onKeyDown={(event) => {
        if (onRowKeyDown) return onRowKeyDown(event);
        if (event.key === "Enter") onSelect(lead);
      }}
      className={cn(
        "border-border hover:bg-accent/40 focus-visible:ring-ring cursor-pointer border-t align-top outline-none transition-colors focus-visible:ring-2 focus-visible:-ring-offset-2",
        lead.status !== "new" && "opacity-70",
        highlightFirst && "bg-[var(--brand)]/5",
        selected && "bg-[var(--brand)]/5",
      )}
      onClick={() => onSelect(lead)}
    >
      {onToggleSelect && (
        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
          <SelectCheckbox
            checked={selected}
            onToggle={(event) => onToggleSelect(lead, event)}
            label={`Select ${lead.name ?? "lead"}`}
          />
        </td>
      )}
      <td className="px-3 py-3">
        <div className={cn("flex flex-col gap-1", highlightFirst && "relative")}>
          <ScoreBadge score={primaryLeadScore(lead)} />
          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
            c{lead.confidenceScore}
          </span>
          <PotentialPill potential={lead.dataQualityTier} />
          {highlightFirst && onDismissHighlight && <FirstLeadTooltip onDismiss={onDismissHighlight} />}
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex items-start gap-2.5">
          <LeadAvatar name={lead.name} intent={lead.leadType} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <IntentBadge intent={lead.leadType} />
              <span className="font-medium">{lead.name ?? "Unknown"}</span>
              {lead.bookmarked && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Favorite" />}
              {lead.appearanceCount > 1 && (
                <span className="text-muted-foreground text-xs">seen {lead.appearanceCount}×</span>
              )}
              {lead.status !== "new" && (
                <span className="bg-muted rounded px-1.5 py-0.5 text-[11px]">
                  {leadStatusLabel(lead.status)}
                </span>
              )}
            </div>
            {/* The buyer's own words, not a paraphrase — same quoted-language
                (font-serif italic) treatment as the card view above. */}
            <p className="text-muted-foreground font-serif mt-1 line-clamp-2 max-w-xl text-sm italic">
              {appearance?.listingTitle ? `${appearance.listingTitle} — ` : ""}
              {appearance?.body || "(no text)"}
            </p>
            <ScoreReasons reasons={appearance?.scoreReasons ?? []} className="mt-1.5" />
          </div>
        </div>
      </td>

      <td className="text-muted-foreground px-3 py-3 text-xs">
        {lead.propertyTypes.length ? lead.propertyTypes.join(", ") : "—"}
      </td>
      <td className="text-muted-foreground px-3 py-3 text-xs">
        {lead.locations.length ? lead.locations.join(", ") : "—"}
      </td>
      <td className="px-3 py-3 font-mono text-xs tabular-nums">{budgetLabel(lead)}</td>
      <td className="text-muted-foreground px-3 py-3 text-xs">
        <RelativeTime value={lead.latestAppearanceAt} />
      </td>
      <td className="px-3 py-3 text-xs">
        {lead.assignedToName ? lead.assignedToName : <span className="text-muted-foreground">Unassigned</span>}
      </td>

      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
        <ContactActions lead={lead} onContact={onContact} />
      </td>
    </tr>
  );
});

/**
 * Replaces `LeadFilterBar` in place while anything is selected, rather than
 * stacking a second bar underneath it — one row of chrome at a time, same as
 * the design doc's "the toolbar replaces the page header, not a second bar."
 */
function BulkActionToolbar({
  selectedCount,
  busy,
  teamMembers,
  onAssign,
  onSetStatus,
  onAddTag,
  onMarkContacted,
  onClear,
}: {
  selectedCount: number;
  busy: boolean;
  teamMembers: { id: string; name: string | null; email: string }[];
  onAssign: (userId: string | null) => void;
  onSetStatus: (status: (typeof LEAD_STATUSES)[number]) => void;
  onAddTag: (tag: string) => void;
  onMarkContacted: () => void;
  onClear: () => void;
}) {
  const [tagValue, setTagValue] = useState("");
  const [tagOpen, setTagOpen] = useState(false);

  return (
    <div className="bg-foreground text-background flex flex-wrap items-center justify-between gap-3 rounded-lg px-3.5 py-2.5">
      <div className="flex items-center gap-2.5 text-sm">
        <span className="font-medium">{formatCount(selectedCount)} selected</span>
        <span className="opacity-50">·</span>
        <button type="button" className="opacity-80 hover:opacity-100" onClick={onClear}>
          Clear
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                disabled={busy}
                className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15 disabled:opacity-50"
              >
                Assign to <ChevronDown className="size-3" aria-hidden />
              </button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onAssign(null)}>Unassign</DropdownMenuItem>
            {teamMembers.map((member) => (
              <DropdownMenuItem key={member.id} onClick={() => onAssign(member.id)}>
                {member.name || member.email}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                disabled={busy}
                className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15 disabled:opacity-50"
              >
                Set status <ChevronDown className="size-3" aria-hidden />
              </button>
            }
          />
          <DropdownMenuContent align="start">
            {LEAD_STATUSES.map((status) => (
              <DropdownMenuItem key={status} onClick={() => onSetStatus(status)}>
                {leadStatusLabel(status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover open={tagOpen} onOpenChange={setTagOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                disabled={busy}
                className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15 disabled:opacity-50"
              >
                <Tag className="size-3" aria-hidden /> Add tag
              </button>
            }
          />
          <PopoverContent align="start" className="min-w-56 p-2">
            <form
              className="flex items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                const tag = tagValue.trim();
                if (!tag) return;
                onAddTag(tag);
                setTagValue("");
                setTagOpen(false);
              }}
            >
              <Input
                autoFocus
                value={tagValue}
                onChange={(event) => setTagValue(event.target.value)}
                placeholder="Tag name"
                className="h-8 text-sm"
              />
              <Button type="submit" size="sm" disabled={!tagValue.trim()}>
                Add
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        <Button size="sm" disabled={busy} onClick={onMarkContacted} className="ml-1">
          Mark contacted
        </Button>

        <button
          type="button"
          aria-label="Clear selection"
          onClick={onClear}
          className="ml-1 rounded-md p-1.5 hover:bg-white/10"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * The list + selection + keyboard-nav + pagination for one successful,
 * non-empty page of results. Split out from `LeadInbox` and always mounted
 * with `key={searchParams.toString()}` specifically so `selectedIds` (and
 * every ref that goes with it) resets by *remounting* on filter/page/sort
 * change — React's own idiom for "reset state when an input changes" —
 * rather than a `useEffect` or a render-time ref comparison, both of which
 * this project's stricter React Compiler lint rules reject (no `setState`
 * in an effect body, no ref reads/writes during render).
 */
function LeadResultsView({
  page,
  filters,
  wantsCards,
  isPlaceholderData,
  isFetching,
  facets,
  teamMembers,
  currentUserId,
  contact,
  setSelected,
  isFirstLeadHighlighted,
  dismissFirstLeadTooltip,
  goToPage,
}: {
  page: LeadPage;
  filters: LeadFilters;
  wantsCards: boolean;
  isPlaceholderData: boolean;
  isFetching: boolean;
  facets: FacetDescriptor[];
  teamMembers: { id: string; name: string | null; email: string }[];
  currentUserId: string;
  contact: (lead: LeadListItem, channel: ContactChannel) => void;
  setSelected: (lead: LeadListItem) => void;
  isFirstLeadHighlighted: (index: number, lead: LeadListItem) => boolean;
  dismissFirstLeadTooltip: () => void;
  goToPage: (page: number) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fieldLabels = useFieldLabels();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastCheckedIdRef = useRef<string | null>(null);
  const { busyId, run: runBulk } = useServerAction();
  const bulkBusy = busyId === "bulk";

  const toggleSelect = useCallback(
    (lead: LeadListItem, event: React.MouseEvent) => {
      event.stopPropagation();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const ids = page.items.map((item) => item.id);
        if (event.shiftKey && lastCheckedIdRef.current) {
          const from = ids.indexOf(lastCheckedIdRef.current);
          const to = ids.indexOf(lead.id);
          if (from !== -1 && to !== -1) {
            const [start, end] = from < to ? [from, to] : [to, from];
            const shouldSelect = !next.has(lead.id);
            for (let i = start; i <= end; i += 1) {
              if (shouldSelect) next.add(ids[i]);
              else next.delete(ids[i]);
            }
            lastCheckedIdRef.current = lead.id;
            return next;
          }
        }
        if (next.has(lead.id)) next.delete(lead.id);
        else next.add(lead.id);
        lastCheckedIdRef.current = lead.id;
        return next;
      });
    },
    [page],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastCheckedIdRef.current = null;
  }, []);

  const runBulkAction = useCallback(
    (action: Parameters<typeof runBulk>[1], successMessage: string) => {
      void runBulk("bulk", action, {
        invalidateKeys: [["leads"]],
        errorFallback: "That bulk action failed. Please try again.",
        onSuccess: () => {
          toast.success(successMessage);
          clearSelection();
        },
      });
    },
    [runBulk, clearSelection],
  );

  const bulkAssign = useCallback(
    (userId: string | null) => {
      const leadIds = [...selectedIds];
      runBulkAction(() => bulkAssignLeads({ leadIds, userId }), `Assigned ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}.`);
    },
    [selectedIds, runBulkAction],
  );
  const bulkStatus = useCallback(
    (status: (typeof LEAD_STATUSES)[number]) => {
      const leadIds = [...selectedIds];
      runBulkAction(() => bulkSetStatus({ leadIds, status }), `Updated ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}.`);
    },
    [selectedIds, runBulkAction],
  );
  const bulkTag = useCallback(
    (tag: string) => {
      const leadIds = [...selectedIds];
      runBulkAction(() => bulkAddTag({ leadIds, tag }), `Tagged ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}.`);
    },
    [selectedIds, runBulkAction],
  );
  const bulkContact = useCallback(() => {
    const leadIds = [...selectedIds];
    runBulkAction(() => bulkMarkContacted({ leadIds }), `Marked ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} as contacted.`);
  }, [selectedIds, runBulkAction]);

  /**
   * Keyboard-first triage, "row focus only" — bound directly on each
   * `LeadCard`/`LeadRow` (real DOM focus, roving via `useListKeyboardNav`),
   * never on `window`, so it's additive to clicking/tapping rather than a
   * mode the rest of the page has to route around. j/k mirror vim's
   * up/down convention agents doing 50+ rows a day are likely to already
   * know; arrow keys work the same way for everyone else. `e`/`a`/`s`/`x`
   * act on whichever row currently has focus without opening it.
   */
  const { setRowRef, moveFocus } = useListKeyboardNav(page.items.length);
  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent, lead: LeadListItem, index: number) => {
      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          moveFocus(index, 1);
          return;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          moveFocus(index, -1);
          return;
        case "Enter":
        case " ":
          event.preventDefault();
          setSelected(lead);
          return;
        case "e":
          event.preventDefault();
          void markContacted({ leadId: lead.id, channel: "whatsapp" }).then((result) => {
            if (!result?.data) {
              toast.error(result?.serverError ?? "Couldn't mark contacted.");
              return;
            }
            void queryClient.invalidateQueries({ queryKey: ["leads"] });
            router.refresh();
          });
          return;
        case "a":
          event.preventDefault();
          void assignLead({ leadId: lead.id, userId: currentUserId }).then((result) => {
            if (!result?.data) {
              toast.error(result?.serverError ?? "Couldn't assign.");
              return;
            }
            toast.success("Assigned to you.");
            void queryClient.invalidateQueries({ queryKey: ["leads"] });
            router.refresh();
          });
          return;
        case "s":
          event.preventDefault();
          void toggleBookmark({ leadId: lead.id }).then((result) => {
            if (!result?.data) {
              toast.error(result?.serverError ?? "Couldn't save.");
              return;
            }
            void queryClient.invalidateQueries({ queryKey: ["leads"] });
            router.refresh();
          });
          return;
        case "x":
          event.preventDefault();
          toggleSelect(lead, event as unknown as React.MouseEvent);
          return;
        default:
      }
    },
    [moveFocus, currentUserId, queryClient, router, toggleSelect, setSelected],
  );

  return (
    <>
      {selectedIds.size > 0 ? (
        <BulkActionToolbar
          selectedCount={selectedIds.size}
          busy={bulkBusy}
          teamMembers={teamMembers}
          onAssign={bulkAssign}
          onSetStatus={bulkStatus}
          onAddTag={bulkTag}
          onMarkContacted={bulkContact}
          onClear={clearSelection}
        />
      ) : (
        <LeadFilterBar facets={facets} activeCount={countActiveFilters(filters)} isFetching={isFetching} />
      )}

      <div className={cn("flex flex-col gap-4 transition-opacity", isPlaceholderData && "opacity-60")}>
        {/* Below md, a fixed-column table can't fit — cards regardless of view preference. */}
        <div className="grid gap-3 md:hidden" data-testid="lead-list-mobile">
          {page.items.map((lead, index) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onSelect={setSelected}
              onContact={contact}
              highlightFirst={isFirstLeadHighlighted(index, lead)}
              onDismissHighlight={dismissFirstLeadTooltip}
              selected={selectedIds.has(lead.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>

        {/* md and up: the table, unless the user chose the cards view. */}
        {wantsCards ? (
          <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3" data-testid="lead-list-desktop">
            {page.items.map((lead, index) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onSelect={setSelected}
                onContact={contact}
                highlightFirst={isFirstLeadHighlighted(index, lead)}
                onDismissHighlight={dismissFirstLeadTooltip}
                selected={selectedIds.has(lead.id)}
                onToggleSelect={toggleSelect}
                rowRef={setRowRef(index)}
                onRowKeyDown={(event) => handleRowKeyDown(event, lead, index)}
              />
            ))}
          </div>
        ) : (
          <DataTable minWidth="min-w-[900px]" className="hidden md:block" data-testid="lead-list-desktop">
            <DataTableHead>
              <th className="w-9" />
              <th className="w-20">Score</th>
              <th>Lead</th>
              <th className="w-32">{fieldLabels.wants}</th>
              <th className="w-32">Where</th>
              <th className="w-28">{fieldLabels.budget}</th>
              <th className="w-24">Last seen</th>
              <th className="w-24">Owner</th>
              <th className="w-36">Act</th>
            </DataTableHead>
            <tbody>
              {page.items.map((lead, index) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onSelect={setSelected}
                  onContact={contact}
                  highlightFirst={isFirstLeadHighlighted(index, lead)}
                  onDismissHighlight={dismissFirstLeadTooltip}
                  selected={selectedIds.has(lead.id)}
                  onToggleSelect={toggleSelect}
                  rowRef={setRowRef(index)}
                  onRowKeyDown={(event) => handleRowKeyDown(event, lead, index)}
                />
              ))}
            </tbody>
          </DataTable>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          Page {page.page} of {page.totalPages} · {formatCount(page.total)} leads
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page.page <= 1 || isFetching} onClick={() => goToPage(page.page - 1)}>
            <ChevronLeft className="size-3.5" aria-hidden />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page.page >= page.totalPages || isFetching}
            onClick={() => goToPage(page.page + 1)}
          >
            Next
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground hidden text-xs md:block">
        Focus a row, then{" "}
        <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">j</kbd>/
        <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">k</kbd> to navigate,{" "}
        <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">↵</kbd> to open,{" "}
        <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">e</kbd> contacted,{" "}
        <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">a</kbd> assign to you,{" "}
        <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">s</kbd> save,{" "}
        <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">x</kbd> select.
      </p>
    </>
  );
}

/**
 * Self-sufficient: derives `filters` from the URL itself (no props from the
 * server wrapper — see app/(app)/leads/page.tsx) and re-fetches through
 * `useLeadsQuery` on every filter/sort/page change, via `/api/leads` rather
 * than a Next navigation. `isPlaceholderData` is what drives the "still
 * showing the old page, dimmed, while the new one loads" treatment — the
 * concrete reason `placeholderData: keepPreviousData` is set on the query.
 */
export function LeadInbox({
  canCollectData = false,
  currentUserId,
  companyFieldLabels,
  canManageSharedSearches = false,
  hasAiAssist = false,
  teamMembers = [],
}: {
  canCollectData?: boolean;
  currentUserId: string;
  /** Category-aware field labels ("Wants"/"Property types" etc), joined from `categories.field_labels` — see `features/leads/vertical-context.tsx`. */
  companyFieldLabels: VerticalFieldLabels;
  canManageSharedSearches?: boolean;
  /** `aiAssistant` plan feature — gates the summary/message-draft buttons in the detail sheet. */
  hasAiAssist?: boolean;
  /** For the detail sheet's Assignee select — same list the pipeline board uses. */
  teamMembers?: { id: string; name: string | null; email: string }[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { searchParams, setParams, goToPage } = useUrlFilters();
  const filters = useMemo(() => parseLeadFilters(searchParams), [searchParams]);
  const wantsCards = filters.view === "cards";

  const [selected, setSelected] = useState<LeadListItem | null>(null);

  const {
    data: page,
    isPlaceholderData,
    isFetching,
    isError,
    refetch,
  } = useLeadsQuery(filters);
  const { data: facets = [] } = useLeadFacetsQuery(filters.datasetId);
  const { data: savedViews = [] } = useSavedViewsQuery();

  /**
   * One tooltip, not a tour: fires once, around the single top-ranked lead,
   * only on an unfiltered first page (a filtered/paginated "top" lead isn't
   * really the inbox's top lead). `tooltipClosed` dismisses it immediately
   * on click without waiting for the `localStorage` round-trip that
   * `firstLeadTooltipDismissed` depends on.
   */
  const firstLeadTooltipDismissed = useLocalStorageValue(FIRST_LEAD_TOOLTIP_DISMISSED_KEY) === "true";
  const [tooltipClosed, setTooltipClosed] = useState(false);
  const dismissFirstLeadTooltip = useCallback(() => {
    setTooltipClosed(true);
    setLocalStorageValue(FIRST_LEAD_TOOLTIP_DISMISSED_KEY, "true");
  }, []);
  const showFirstLeadTooltip =
    !firstLeadTooltipDismissed &&
    !tooltipClosed &&
    page?.page === 1 &&
    countActiveFilters(filters) === 0;
  const isFirstLeadHighlighted = (index: number, lead: LeadListItem) =>
    index === 0 && showFirstLeadTooltip && primaryLeadScore(lead) >= FIRST_LEAD_TOOLTIP_SCORE_THRESHOLD;

  /**
   * Logs the touch first, then opens the channel — the metric must not depend
   * on the tab opening. `useCallback`'d (stable deps: `queryClient`/`router`
   * are themselves stable) so it doesn't defeat `LeadCard`/`LeadRow`'s memo on
   * every `LeadInbox` render.
   */
  const contact = useCallback(
    async (lead: LeadListItem, channel: ContactChannel) => {
      const result = await markContacted({ leadId: lead.id, channel });
      if (!result?.data) {
        // Surfaced, but not blocking: the real-world contact below still
        // happens even if logging the touch failed — see the comment above.
        toast.error(result?.serverError ?? "Contact logged locally but couldn't be saved — it may not count toward time-to-first-touch.");
      }
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      router.refresh();

      const externalUrl = lead.primaryAppearance?.externalUrl ?? null;
      if (channel === "whatsapp" && lead.contact.whatsapp) {
        window.open(`https://wa.me/${lead.contact.whatsapp.replace(/\D/g, "")}`, "_blank", "noopener");
      } else if (channel === "post" && externalUrl) {
        window.open(externalUrl, "_blank", "noopener");
      }
    },
    [queryClient, router],
  );

  return (
    <FieldLabelsProvider fieldLabels={companyFieldLabels}>
    <div className="flex flex-col gap-4">
      <SavedSearchesBar
        views={savedViews}
        currentUserId={currentUserId}
        canManageSharedSearches={canManageSharedSearches}
      />

      {isError ? (
        <>
          <LeadFilterBar facets={facets} activeCount={countActiveFilters(filters)} isFetching={isFetching} />
          <ErrorState
            title="Couldn't load leads"
            description="The request to fetch this page of leads failed."
            onRetry={() => void refetch()}
          />
        </>
      ) : !page ? (
        <>
          <LeadFilterBar facets={facets} activeCount={countActiveFilters(filters)} isFetching={isFetching} />
          <TableSkeleton />
        </>
      ) : page.items.length === 0 ? (
        <>
          <LeadFilterBar facets={facets} activeCount={countActiveFilters(filters)} isFetching={isFetching} />
          {countActiveFilters(filters) === 0 && !filters.datasetId && page.total === 0 ? (
            <EmptyState
              title="No leads yet"
              description={
                canCollectData
                  ? "Connect a data source and AveronAi starts finding buyer leads automatically — no filters to widen, there's just nothing collected yet."
                  : "Nothing collected yet — ask an admin or manager to connect a data source under Collect data."
              }
              action={
                canCollectData ? (
                  <Button size="sm" render={<Link href="/admin/collection">Collect data</Link>} />
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              title="No leads match these filters"
              description="Widen the filters, switch dataset scope, or run a sync from the admin area if this source is new."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setParams((next) => {
                      const datasetId = next.get("datasetId");
                      for (const key of [...next.keys()]) next.delete(key);
                      if (datasetId) next.set("datasetId", datasetId);
                    })
                  }
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </>
      ) : (
        <LeadResultsView
          key={searchParams.toString()}
          page={page}
          filters={filters}
          wantsCards={wantsCards}
          isPlaceholderData={isPlaceholderData}
          isFetching={isFetching}
          facets={facets}
          teamMembers={teamMembers}
          currentUserId={currentUserId}
          contact={contact}
          setSelected={setSelected}
          isFirstLeadHighlighted={isFirstLeadHighlighted}
          dismissFirstLeadTooltip={dismissFirstLeadTooltip}
          goToPage={goToPage}
        />
      )}

      <LeadDetailSheet
        lead={selected}
        onClose={() => setSelected(null)}
        onSelectLead={setSelected}
        hasAiAssist={hasAiAssist}
        teamMembers={teamMembers}
      />
    </div>
    </FieldLabelsProvider>
  );
}
