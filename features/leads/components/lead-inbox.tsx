"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, MessageCircle, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { RelativeTime } from "@/components/common/relative-time";
import { IntentBadge } from "@/components/common/intent-badge";
import { ScoreBadge, ScoreReasons } from "@/components/common/score-badge";
import { PotentialPill } from "@/components/common/potential-pill";
import { LeadFilterBar } from "./lead-filter-bar";
import { SavedSearchesBar } from "./saved-searches-bar";
import { FirstLeadTooltip } from "./first-lead-tooltip";
import { markContacted } from "@/application/leads/lead.actions";
import { setLocalStorageValue, useLocalStorageValue } from "@/hooks/use-local-storage-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useLeadFacetsQuery, useLeadsQuery, useSavedViewsQuery } from "@/features/leads/queries";
import { parseLeadFilters, type LeadFilters } from "@/application/leads/filters.schema";
import { leadStatusLabel } from "@/application/leads/lead-status";
import type { LeadListItem } from "@/application/leads/lead-queries";
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
  if (filters.collectedAfter) count += 1;
  if (filters.collectedBefore) count += 1;
  count += Object.keys(filters.attr).length;
  return count;
}

type ContactChannel = "whatsapp" | "phone" | "post";

const FIRST_LEAD_TOOLTIP_DISMISSED_KEY = "dreamrue:first-lead-tooltip:dismissed";
/** Same "high" cutoff `components/common/score-badge.tsx`'s internal `tone()` uses — a middling top lead gets no tooltip. */
const FIRST_LEAD_TOOLTIP_SCORE_THRESHOLD = 70;

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
            void navigator.clipboard.writeText(lead.contact.phone!);
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
}: {
  lead: LeadListItem;
  onSelect: (lead: LeadListItem) => void;
  onContact: (lead: LeadListItem, channel: ContactChannel) => void;
  /** True only for the single top-ranked lead, and only while the first-lead tooltip hasn't been dismissed. */
  highlightFirst?: boolean;
  onDismissHighlight?: () => void;
}) {
  const appearance = lead.primaryAppearance;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(lead)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(lead);
        }
      }}
      className={cn(
        "border-border bg-card hover:bg-accent/40 focus-visible:ring-ring relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors outline-none focus-visible:ring-2",
        lead.status !== "new" && "opacity-70",
        highlightFirst && "ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ScoreBadge score={primaryLeadScore(lead)} />
          <IntentBadge intent={lead.leadType} />
          <PotentialPill potential={lead.dataQualityTier} />
          {lead.bookmarked && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Favorite" />}
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">
          <RelativeTime value={lead.latestAppearanceAt} />
        </span>
      </div>

      <div>
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
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
          {appearance?.listingTitle ? `${appearance.listingTitle} — ` : ""}
          {appearance?.body || "(no text)"}
        </p>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span>{lead.propertyTypes.length ? lead.propertyTypes.join(", ") : "Any property type"}</span>
        <span>{lead.locations.length ? lead.locations.join(", ") : "Any location"}</span>
        <span className="font-mono tabular-nums">{budgetLabel(lead)}</span>
      </div>

      <ScoreReasons reasons={appearance?.scoreReasons ?? []} />

      <div className="mt-1 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
          confidence {lead.confidenceScore}
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
}: {
  lead: LeadListItem;
  onSelect: (lead: LeadListItem) => void;
  onContact: (lead: LeadListItem, channel: ContactChannel) => void;
  /** True only for the single top-ranked lead, and only while the first-lead tooltip hasn't been dismissed. */
  highlightFirst?: boolean;
  onDismissHighlight?: () => void;
}) {
  const appearance = lead.primaryAppearance;
  return (
    <tr
      className={cn(
        "border-border hover:bg-accent/40 cursor-pointer border-t align-top transition-colors",
        lead.status !== "new" && "opacity-70",
        highlightFirst && "bg-[var(--brand)]/5",
      )}
      onClick={() => onSelect(lead)}
    >
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
        <p className="text-muted-foreground mt-1 line-clamp-2 max-w-xl text-sm">
          {appearance?.listingTitle ? `${appearance.listingTitle} — ` : ""}
          {appearance?.body || "(no text)"}
        </p>
        <ScoreReasons reasons={appearance?.scoreReasons ?? []} className="mt-1.5" />
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

      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
        <ContactActions lead={lead} onContact={onContact} />
      </td>
    </tr>
  );
});

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
  canManageSharedSearches = false,
  hasAiAssist = false,
}: {
  canCollectData?: boolean;
  currentUserId: string;
  canManageSharedSearches?: boolean;
  /** `aiAssistant` plan feature — gates the summary/message-draft buttons in the detail sheet. */
  hasAiAssist?: boolean;
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
    <div className="flex flex-col gap-4">
      <SavedSearchesBar
        views={savedViews}
        currentUserId={currentUserId}
        canManageSharedSearches={canManageSharedSearches}
      />

      <LeadFilterBar
        facets={facets}
        activeCount={countActiveFilters(filters)}
        isFetching={isFetching}
      />

      {isError ? (
        <ErrorState
          title="Couldn't load leads"
          description="The request to fetch this page of leads failed."
          onRetry={() => void refetch()}
        />
      ) : !page ? (
        <TableSkeleton />
      ) : page.items.length === 0 ? (
        countActiveFilters(filters) === 0 && !filters.datasetId && page.total === 0 ? (
          <EmptyState
            title="No leads yet"
            description={
              canCollectData
                ? "Connect a data source and DreamRue starts finding buyer leads automatically — no filters to widen, there's just nothing collected yet."
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
        )
      ) : (
        <>
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
                />
              ))}
            </div>

            {/* md and up: the table, unless the user chose the cards view. */}
            {wantsCards ? (
              <div
                className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3"
                data-testid="lead-list-desktop"
              >
                {page.items.map((lead, index) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onSelect={setSelected}
                    onContact={contact}
                    highlightFirst={isFirstLeadHighlighted(index, lead)}
                    onDismissHighlight={dismissFirstLeadTooltip}
                  />
                ))}
              </div>
            ) : (
              <DataTable
                minWidth="min-w-[900px]"
                className="hidden md:block"
                data-testid="lead-list-desktop"
              >
                <DataTableHead>
                  <th className="w-20">Score</th>
                  <th>Lead</th>
                  <th className="w-32">Wants</th>
                  <th className="w-32">Where</th>
                  <th className="w-28">Budget</th>
                  <th className="w-24">Last seen</th>
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
              <Button
                variant="outline"
                size="sm"
                disabled={page.page <= 1 || isFetching}
                onClick={() => goToPage(page.page - 1)}
              >
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
        </>
      )}

      <LeadDetailSheet
        lead={selected}
        onClose={() => setSelected(null)}
        onSelectLead={setSelected}
        hasAiAssist={hasAiAssist}
      />
    </div>
  );
}
