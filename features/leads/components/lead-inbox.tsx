"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { IntentBadge } from "@/components/common/intent-badge";
import { ScoreBadge, ScoreReasons } from "@/components/common/score-badge";
import { LeadFilterBar } from "./lead-filter-bar";
import { LeadDetailSheet } from "./lead-detail-sheet";
import { markContacted } from "@/application/leads/lead.actions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { LeadFilters } from "@/application/leads/filters.schema";
import type { FacetDescriptor } from "@/application/leads/facets";
import type { LeadListItem, LeadPage } from "@/application/leads/lead-queries";
import { cn } from "@/lib/utils";
import { formatCompact, formatCount } from "@/shared/format";

function budgetLabel(lead: LeadListItem): string {
  if (lead.budgetMin === null && lead.budgetMax === null) return "—";
  const currency = lead.budgetCurrency ?? "";
  if (lead.budgetMin === lead.budgetMax) return `${currency} ${formatCompact(lead.budgetMin ?? 0)}`;
  return `${currency} ${formatCompact(lead.budgetMin ?? 0)}–${formatCompact(lead.budgetMax ?? 0)}`;
}

function countActiveFilters(filters: LeadFilters): number {
  let count = 0;
  if (filters.q) count += 1;
  count += filters.intent.length + filters.status.length;
  count += filters.propertyTypes.length + filters.locations.length + filters.groups.length;
  if (filters.minIntent !== undefined) count += 1;
  if (filters.hasContact) count += 1;
  count += Object.keys(filters.attr).length;
  return count;
}

type ContactChannel = "whatsapp" | "phone" | "post";

function ContactActions({
  lead,
  onContact,
}: {
  lead: LeadListItem;
  onContact: (lead: LeadListItem, channel: ContactChannel) => void;
}) {
  if (!lead.contact.whatsapp && !lead.contact.phone && !lead.externalUrl) {
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
            void markContacted({ leadId: lead.id, channel: "phone" });
          }}
        >
          <Phone className="size-3.5" aria-hidden />
        </Button>
      )}
      {lead.externalUrl && (
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
}

/**
 * Used both as the forced mobile layout (a fixed-column table can't fit a
 * narrow viewport) and as the explicit "cards" view at any width — `filters.view`
 * already had a `"cards"` option in the schema with nothing rendering it.
 */
function LeadCard({
  lead,
  onSelect,
  onContact,
}: {
  lead: LeadListItem;
  onSelect: (lead: LeadListItem) => void;
  onContact: (lead: LeadListItem, channel: ContactChannel) => void;
}) {
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
        "border-border bg-card hover:bg-accent/40 focus-visible:ring-ring flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors outline-none focus-visible:ring-2",
        lead.status !== "new" && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ScoreBadge score={lead.intentScore} />
          <IntentBadge intent={lead.intent} />
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">
          <RelativeTime value={lead.postedAt} />
        </span>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{lead.authorName ?? "Unknown"}</span>
          {lead.duplicateCount > 0 && (
            <span className="text-muted-foreground text-xs">+{lead.duplicateCount} similar</span>
          )}
          {lead.status !== "new" && (
            <span className="bg-muted rounded px-1.5 py-0.5 text-[11px]">
              {lead.status.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
          {lead.listingTitle ? `${lead.listingTitle} — ` : ""}
          {lead.body || "(no text)"}
        </p>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span>{lead.propertyTypes.length ? lead.propertyTypes.join(", ") : "Any property type"}</span>
        <span>{lead.locations.length ? lead.locations.join(", ") : "Any location"}</span>
        <span className="font-mono tabular-nums">{budgetLabel(lead)}</span>
      </div>

      <ScoreReasons reasons={lead.scoreReasons} />

      <div className="mt-1 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
          quality {lead.qualityScore}
        </span>
        <ContactActions lead={lead} onContact={onContact} />
      </div>
    </div>
  );
}

export function LeadInbox({
  page,
  filters,
  facets,
}: {
  page: LeadPage;
  filters: LeadFilters;
  facets: FacetDescriptor[];
}) {
  const router = useRouter();
  const { goToPage } = useUrlFilters();
  const [selected, setSelected] = useState<LeadListItem | null>(null);
  const wantsCards = filters.view === "cards";

  /** Logs the touch first, then opens the channel — the metric must not depend on the tab opening. */
  async function contact(lead: LeadListItem, channel: ContactChannel) {
    await markContacted({ leadId: lead.id, channel });
    router.refresh();

    if (channel === "whatsapp" && lead.contact.whatsapp) {
      window.open(`https://wa.me/${lead.contact.whatsapp.replace(/\D/g, "")}`, "_blank", "noopener");
    } else if (channel === "post" && lead.externalUrl) {
      window.open(lead.externalUrl, "_blank", "noopener");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <LeadFilterBar facets={facets} activeCount={countActiveFilters(filters)} />

      {page.items.length === 0 ? (
        <EmptyState
          title="No leads match these filters"
          description="Widen the filters, switch dataset scope, or run a sync from the admin area if this source is new."
        />
      ) : (
        <>
          {/* Below md, a fixed-column table can't fit — cards regardless of view preference. */}
          <div className="grid gap-3 md:hidden" data-testid="lead-list-mobile">
            {page.items.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onSelect={setSelected} onContact={contact} />
            ))}
          </div>

          {/* md and up: the table, unless the user chose the cards view. */}
          {wantsCards ? (
            <div
              className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3"
              data-testid="lead-list-desktop"
            >
              {page.items.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onSelect={setSelected} onContact={contact} />
              ))}
            </div>
          ) : (
            <div
              className="border-border hidden overflow-x-auto rounded-xl border md:block"
              data-testid="lead-list-desktop"
            >
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                    <th className="w-20">Score</th>
                    <th>Lead</th>
                    <th className="w-32">Wants</th>
                    <th className="w-32">Where</th>
                    <th className="w-28">Budget</th>
                    <th className="w-24">Posted</th>
                    <th className="w-36">Act</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((lead) => (
                    <tr
                      key={lead.id}
                      className={cn(
                        "border-border hover:bg-accent/40 cursor-pointer border-t align-top transition-colors",
                        lead.status !== "new" && "opacity-70",
                      )}
                      onClick={() => setSelected(lead)}
                    >
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <ScoreBadge score={lead.intentScore} />
                          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                            q{lead.qualityScore}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <IntentBadge intent={lead.intent} />
                          <span className="font-medium">{lead.authorName ?? "Unknown"}</span>
                          {lead.duplicateCount > 0 && (
                            <span className="text-muted-foreground text-xs">
                              +{lead.duplicateCount} similar
                            </span>
                          )}
                          {lead.status !== "new" && (
                            <span className="bg-muted rounded px-1.5 py-0.5 text-[11px]">
                              {lead.status.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1 line-clamp-2 max-w-xl text-sm">
                          {lead.listingTitle ? `${lead.listingTitle} — ` : ""}
                          {lead.body || "(no text)"}
                        </p>
                        <ScoreReasons reasons={lead.scoreReasons} className="mt-1.5" />
                      </td>

                      <td className="text-muted-foreground px-3 py-3 text-xs">
                        {lead.propertyTypes.length ? lead.propertyTypes.join(", ") : "—"}
                      </td>
                      <td className="text-muted-foreground px-3 py-3 text-xs">
                        {lead.locations.length ? lead.locations.join(", ") : "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs tabular-nums">{budgetLabel(lead)}</td>
                      <td className="text-muted-foreground px-3 py-3 text-xs">
                        <RelativeTime value={lead.postedAt} />
                      </td>

                      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                        <ContactActions lead={lead} onContact={contact} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">
              Page {page.page} of {page.totalPages} · {formatCount(page.total)} leads
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page.page <= 1}
                onClick={() => goToPage(page.page - 1)}
              >
                <ChevronLeft className="size-3.5" aria-hidden />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page.page >= page.totalPages}
                onClick={() => goToPage(page.page + 1)}
              >
                Next
                <ChevronRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}

      <LeadDetailSheet lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
