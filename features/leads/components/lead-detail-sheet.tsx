"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IntentBadge } from "@/components/common/intent-badge";
import { ScoreBadge } from "@/components/common/score-badge";
import { PotentialPill } from "@/components/common/potential-pill";
import { Spinner } from "@/components/common/spinner";
import { saveLeadNotes, setLeadStatus } from "@/application/leads/lead.actions";
import {
  linkLeadToCompany,
  linkLeadToExistingCompany,
  unlinkLeadFromCompany,
} from "@/application/companies/target-company.actions";
import { LEAD_STATUSES, leadStatusLabel } from "@/application/leads/lead-status";
import {
  useLeadAffiliationsQuery,
  useLeadAppearancesQuery,
  useLeadValidationQuery,
  useTargetCompanySearchQuery,
} from "@/features/leads/queries";
import type { LeadAppearanceListItem, LeadListItem } from "@/application/leads/lead-queries";
import { primaryLeadScore } from "@/domain/lead/ranking";

const AFFILIATION_ROLES = ["unknown", "owner", "agent", "employee"] as const;

interface EngagementContext {
  targetPostExternalId?: string | null;
  targetPostUrl?: string | null;
  targetListingTitle?: string | null;
  targetPriceRaw?: string | null;
  targetLocationRaw?: string | null;
}

/**
 * Passthrough attribute values are `unknown` — a raw upstream payload can put
 * an object or array behind any key. `String(value)` on those renders the
 * literal text "[object Object]"; this formats every shape sensibly instead.
 */
function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(formatAttributeValue).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function LeadDetailSheet({
  lead,
  onClose,
}: {
  lead: LeadListItem | null;
  onClose: () => void;
}) {
  if (!lead) return null;
  // Keyed on the lead id so selecting a different lead remounts with that
  // lead's notes, instead of syncing props into state from an effect.
  return <LeadDetail key={lead.id} lead={lead} onClose={onClose} />;
}

function LeadDetail({ lead, onClose }: { lead: LeadListItem; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(lead.notes);
  const [saving, setSaving] = useState(false);
  const { data: appearances = [], isLoading: loadingAppearances } = useLeadAppearancesQuery(lead.id);

  async function update(status: (typeof LEAD_STATUSES)[number]) {
    setSaving(true);
    await setLeadStatus({ leadId: lead.id, status });
    setSaving(false);
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    router.refresh();
  }

  async function persistNotes() {
    if (notes === lead.notes) return;
    setSaving(true);
    await saveLeadNotes({ leadId: lead.id, notes });
    setSaving(false);
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    router.refresh();
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <IntentBadge intent={lead.leadType} />
            {lead.name ?? "Unknown"}
            <ScoreBadge score={primaryLeadScore(lead)} />
          </SheetTitle>
          <SheetDescription>
            {lead.username ? `@${lead.username}` : "Unknown handle"}
            {lead.location ? ` · ${lead.location}` : ""} · seen {lead.appearanceCount}{" "}
            {lead.appearanceCount === 1 ? "time" : "times"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          {lead.avatarUrl && (
            // Plain <img>: these are signed CDN URLs that expire, so the
            // optimizer would cache a URL that stops resolving.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lead.avatarUrl}
              alt=""
              loading="lazy"
              className="border-border size-16 shrink-0 rounded-full border object-cover"
            />
          )}

          {lead.bio && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold">Bio</h3>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{lead.bio}</p>
            </section>
          )}

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">AI analysis</h3>
            <div className="mb-2 flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1">
                <ScoreBadge score={lead.buyerScore} label="buyer" /> buyer
              </span>
              <span className="flex items-center gap-1">
                <ScoreBadge score={lead.sellerScore} label="seller" /> seller
              </span>
              <span className="flex items-center gap-1">
                <ScoreBadge score={lead.investorScore} label="investor" /> investor
              </span>
              <span className="flex items-center gap-1">
                <ScoreBadge score={lead.confidenceScore} label="confidence" /> confidence
              </span>
            </div>
            <p className="text-muted-foreground text-sm">{lead.aiExplanation || "No signal yet."}</p>
          </section>

          <LeadValidationSection leadId={lead.id} />

          <section className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Wants" value={lead.propertyTypes.join(", ") || "—"} />
            <Field label="Where" value={lead.locations.join(", ") || "—"} />
            <Field
              label="Budget"
              value={
                lead.budgetMin === null && lead.budgetMax === null
                  ? "—"
                  : `${lead.budgetCurrency ?? ""} ${lead.budgetMin ?? "?"}–${lead.budgetMax ?? "?"}`
              }
            />
            <Field label="Facebook" value={lead.facebookId ?? "—"} />
            <Field label="Instagram" value={lead.instagramId ?? "—"} />
            <Field label="WhatsApp" value={lead.contact.whatsapp ?? "—"} />
            <Field label="Phone" value={lead.contact.phone ?? "—"} />
            <Field label="Email" value={lead.contact.email ?? "—"} />
          </section>

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">
              Sources {appearances.length > 0 && `(${appearances.length})`}
            </h3>
            <p className="text-muted-foreground mb-2 text-xs">
              Every post, comment or like this lead was collected from.
            </p>
            {loadingAppearances ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : appearances.length === 0 ? (
              <p className="text-muted-foreground text-sm">No sources found.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {appearances.map((appearance) => (
                  <AppearanceCard key={appearance.id} appearance={appearance} />
                ))}
              </ul>
            )}
          </section>

          <AffiliatedCompanies leadId={lead.id} />

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Status</h3>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={lead.status === status ? "default" : "outline"}
                  disabled={saving}
                  onClick={() => void update(status)}
                >
                  {leadStatusLabel(status)}
                </Button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Notes</h3>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => void persistNotes()}
              rows={4}
              placeholder="What happened on the call?"
            />
          </section>

          {saving && (
            <div className="flex items-center gap-2">
              <Spinner className="text-muted-foreground size-4" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AppearanceCard({ appearance }: { appearance: LeadAppearanceListItem }) {
  const isEngagement = appearance.recordKind !== "content_post";
  const engagement = appearance.attributes._engagement as EngagementContext | undefined;
  const attributeEntries = Object.entries(appearance.attributes).filter(([key]) => key !== "_engagement");

  return (
    <li className="border-border rounded-lg border p-3 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {appearance.sourceGroup ?? "Unknown source"} ·{" "}
          {format(new Date(appearance.postedAt), "d MMM yyyy, HH:mm")}
          {appearance.duplicateCount > 0 && ` · +${appearance.duplicateCount} reposts`}
        </span>
        <ScoreBadge score={appearance.intentScore} />
      </div>

      {isEngagement ? (
        <>
          <p className="text-muted-foreground text-xs font-medium">
            {appearance.recordKind === "engagement_comment" ? "Commented on" : "Liked"}
          </p>
          {engagement?.targetListingTitle && <p className="font-medium">{engagement.targetListingTitle}</p>}
          <p className="text-muted-foreground">
            {[engagement?.targetLocationRaw, engagement?.targetPriceRaw].filter(Boolean).join(" · ") ||
              "No listing details captured for this engagement."}
          </p>
          {engagement?.targetPostUrl && (
            <a
              href={engagement.targetPostUrl}
              target="_blank"
              rel="noopener"
              className="text-primary mt-1 inline-block text-xs underline"
            >
              View the post they engaged with
            </a>
          )}
        </>
      ) : (
        <>
          {appearance.listingTitle && <p className="font-medium">{appearance.listingTitle}</p>}
          <p className="text-muted-foreground whitespace-pre-wrap">{appearance.body || "(no text)"}</p>
        </>
      )}

      {appearance.scoreReasons.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {appearance.scoreReasons
            .filter((r) => r.weight > 0)
            .slice(0, 3)
            .map((reason) => (
              <li
                key={reason.code + reason.label}
                className="text-muted-foreground border-border/60 rounded border px-1.5 py-0.5 text-[11px] leading-4"
              >
                {reason.label}
              </li>
            ))}
        </ul>
      )}

      {attributeEntries.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {attributeEntries.slice(0, 6).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground truncate">{key}</dt>
              <dd className="truncate">{formatAttributeValue(value).slice(0, 60)}</dd>
            </div>
          ))}
        </dl>
      )}

      {appearance.externalUrl && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => window.open(appearance.externalUrl as string, "_blank", "noopener")}
        >
          <ExternalLink className="size-3.5" aria-hidden />
          Original post
        </Button>
      )}
    </li>
  );
}

/**
 * Customer data validation and lead scoring (domain/scoring/lead-validation.ts)
 * — a different question from the "AI analysis" panel above: that one asks
 * "what does this person's text say" (buyer/seller/investor intent), this one
 * asks "how much should we trust and prioritize this record" by grading the
 * data itself (completeness, contactability, relevance, industry, location,
 * engagement, business potential). Fetched lazily, same as appearances/affiliations.
 */
function LeadValidationSection({ leadId }: { leadId: string }) {
  const { data: validation, isLoading } = useLeadValidationQuery(leadId);

  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold">Data validation &amp; lead score</h3>
      {isLoading || !validation ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <PotentialPill potential={validation.validationResult} />
            <ScoreBadge score={validation.leadScore} label="lead score" />
          </div>
          <ul className="mb-2 flex flex-wrap gap-3 text-xs">
            {(Object.keys(validation.breakdown) as (keyof typeof validation.breakdown)[]).map((key) => (
              <li key={key} className="flex items-center gap-1">
                <ScoreBadge score={validation.breakdown[key]} label={key} />
                <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
              </li>
            ))}
          </ul>
          <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
            {validation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Manual linking only — genuinely new scope, not wired into ingestion. See
 * docs/saas-database-schema.md's `target_companies` section for why.
 */
function AffiliatedCompanies({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const { data: affiliations = [] } = useLeadAffiliationsQuery(leadId);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<(typeof AFFILIATION_ROLES)[number]>("unknown");
  const [linking, setLinking] = useState(false);
  const { data: suggestions = [] } = useTargetCompanySearchQuery(query);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["leads", "affiliations", leadId] });
    void queryClient.invalidateQueries({ queryKey: ["target-companies"] });
  }

  async function linkExisting(targetCompanyId: string) {
    setLinking(true);
    const result = await linkLeadToExistingCompany({ leadId, targetCompanyId, role });
    setLinking(false);
    if (result?.serverError || result?.validationErrors) {
      toast.error(result?.serverError ?? "Could not link that company");
      return;
    }
    setQuery("");
    invalidate();
  }

  async function linkNew() {
    if (!query.trim()) return;
    setLinking(true);
    const result = await linkLeadToCompany({ leadId, companyName: query.trim(), role });
    setLinking(false);
    if (result?.serverError || result?.validationErrors) {
      toast.error(result?.serverError ?? "Could not link that company");
      return;
    }
    setQuery("");
    invalidate();
  }

  async function unlink(affiliationId: string) {
    const result = await unlinkLeadFromCompany({ leadId, affiliationId });
    if (result?.serverError) {
      toast.error(result.serverError);
      return;
    }
    invalidate();
  }

  const exactMatch = suggestions.find((s) => s.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold">Affiliated companies</h3>
      {affiliations.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {affiliations.map((affiliation) => (
            <li
              key={affiliation.id}
              className="border-border bg-muted/40 flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
            >
              {affiliation.targetCompany.name}
              <span className="text-muted-foreground capitalize">· {affiliation.role}</span>
              <button
                type="button"
                aria-label={`Unlink ${affiliation.targetCompany.name}`}
                onClick={() => void unlink(affiliation.id)}
                className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or add a company…"
          className="h-8 max-w-52 text-xs"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as (typeof AFFILIATION_ROLES)[number])}
          className="border-input bg-background h-8 rounded-md border px-2 text-xs capitalize"
        >
          {AFFILIATION_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={linking || !query.trim()}
          onClick={() => void (exactMatch ? linkExisting(exactMatch.id) : linkNew())}
        >
          {linking && <Spinner className="size-3.5" />}
          Link
        </Button>
      </div>

      {query.trim() && suggestions.length > 0 && (
        <ul className="border-border bg-popover mt-1.5 flex max-w-64 flex-col gap-0.5 rounded-md border p-1">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onClick={() => void linkExisting(suggestion.id)}
                className="hover:bg-muted w-full rounded px-2 py-1 text-left text-xs"
              >
                {suggestion.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
