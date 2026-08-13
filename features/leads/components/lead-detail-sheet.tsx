"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, MessageCircle, Star, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { IntentBadge } from "@/components/common/intent-badge";
import { ScoreBadge, ScoreReasons } from "@/components/common/score-badge";
import { PotentialPill } from "@/components/common/potential-pill";
import { Spinner } from "@/components/common/spinner";
import { RelativeTime } from "@/components/common/relative-time";
import { cn } from "@/lib/utils";
import { useServerAction } from "@/hooks/use-server-action";
import { useFieldLabels } from "@/features/leads/vertical-context";
import {
  assignLead,
  markContacted,
  saveLeadNotes,
  setDealValue,
  setLeadStatus,
  setLeadTags,
  splitMerge,
  toggleBookmark,
} from "@/application/leads/lead.actions";
import { generateLeadSummaryAction, generateMessageDraftAction } from "@/application/leads/ai-assist.actions";
import {
  linkLeadToCompany,
  linkLeadToExistingCompany,
  unlinkLeadFromCompany,
} from "@/application/companies/target-company.actions";
import { LEAD_STATUSES, leadStatusLabel } from "@/application/leads/lead-status";
import {
  useLeadAffiliationsQuery,
  useLeadAppearancesQuery,
  useLeadEventsQuery,
  useLeadSimilarQuery,
  useLeadValidationQuery,
  useTargetCompanySearchQuery,
} from "@/features/leads/queries";
import type { LeadAppearanceListItem, LeadListItem } from "@/application/leads/lead-queries";
import { primaryLeadScore } from "@/domain/lead/ranking";

const AFFILIATION_ROLES = ["unknown", "owner", "agent", "employee"] as const;

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

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
  onSelectLead,
  hasAiAssist = false,
  teamMembers = [],
}: {
  lead: LeadListItem | null;
  onClose: () => void;
  /** Lets "Similar leads" swap the open sheet to a recommended lead without closing it. */
  onSelectLead?: (lead: LeadListItem) => void;
  /** `aiAssistant` plan feature — gates the AI summary/message-draft buttons. */
  hasAiAssist?: boolean;
  /** For the Assignee select — same list the pipeline board uses. */
  teamMembers?: TeamMember[];
}) {
  if (!lead) return null;
  // Keyed on the lead id so selecting a different lead remounts with that
  // lead's notes, instead of syncing props into state from an effect.
  return (
    <LeadDetail
      key={lead.id}
      lead={lead}
      onClose={onClose}
      onSelectLead={onSelectLead}
      hasAiAssist={hasAiAssist}
      teamMembers={teamMembers}
    />
  );
}

function LeadDetail({
  lead,
  onClose,
  onSelectLead,
  hasAiAssist,
  teamMembers,
}: {
  lead: LeadListItem;
  onClose: () => void;
  onSelectLead?: (lead: LeadListItem) => void;
  hasAiAssist: boolean;
  teamMembers: TeamMember[];
}) {
  const { busyId, run } = useServerAction();
  const fieldLabels = useFieldLabels();
  const saving = busyId !== null;
  const [notes, setNotes] = useState(lead.notes);
  const [dealValue, setDealValueInput] = useState(lead.dealValueUsd !== null ? String(lead.dealValueUsd) : "");
  const [tags, setTags] = useState(lead.tags);
  const [tagInput, setTagInput] = useState("");
  // Optimistic, local to this open sheet — same reasoning as `notes` above:
  // `lead` is a snapshot captured at row-click time, so a mutation here has no
  // way to flow back into it before the sheet is closed and reopened.
  const [bookmarked, setBookmarked] = useState(lead.bookmarked);
  const { data: appearances = [], isLoading: loadingAppearances } = useLeadAppearancesQuery(lead.id);

  async function update(status: (typeof LEAD_STATUSES)[number]) {
    await run("status", () => setLeadStatus({ leadId: lead.id, status }), {
      errorFallback: "Could not update the status",
      invalidateKeys: [["leads"]],
      onSuccess: () => toast.success(`Status changed to "${leadStatusLabel(status)}"`),
    });
  }

  async function assign(userId: string | null) {
    await run("assignedTo", () => assignLead({ leadId: lead.id, userId }), {
      errorFallback: "Could not assign the lead",
      invalidateKeys: [["leads"]],
      onSuccess: () => toast.success(userId ? "Lead assigned" : "Lead unassigned"),
    });
  }

  async function persistTags(next: string[]) {
    setTags(next);
    await run("tags", () => setLeadTags({ leadId: lead.id, tags: next }), {
      errorFallback: "Could not save tags",
      invalidateKeys: [["leads"]],
    });
  }

  function addTag() {
    const next = tagInput.trim().toLowerCase();
    if (!next || tags.includes(next)) {
      setTagInput("");
      return;
    }
    setTagInput("");
    void persistTags([...tags, next]);
  }

  function removeTag(tag: string) {
    void persistTags(tags.filter((t) => t !== tag));
  }

  async function persistNotes() {
    if (notes === lead.notes) return;
    await run("notes", () => saveLeadNotes({ leadId: lead.id, notes }), {
      errorFallback: "Could not save the notes",
      invalidateKeys: [["leads"]],
      onSuccess: () => toast.success("Notes saved"),
    });
  }

  async function persistDealValue() {
    const trimmed = dealValue.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Deal value must be a positive number");
      return;
    }
    if (parsed === (lead.dealValueUsd ?? null)) return;

    await run("deal-value", () => setDealValue({ leadId: lead.id, dealValueUsd: parsed }), {
      errorFallback: "Could not save the deal value",
      invalidateKeys: [["leads"]],
      onSuccess: () =>
        toast.success(parsed === null ? "Deal value cleared" : `Deal value set to $${parsed.toLocaleString()}`),
    });
  }

  async function bookmark() {
    const next = !bookmarked;
    await run("bookmark", () => toggleBookmark({ leadId: lead.id }), {
      errorFallback: "Could not update favorites",
      invalidateKeys: [["leads"]],
      onSuccess: () => {
        setBookmarked(next);
        toast.success(next ? "Added to favorites" : "Removed from favorites");
      },
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2 pr-8">
            <IntentBadge intent={lead.leadType} />
            {lead.name ?? "Unknown"}
            <ScoreBadge score={primaryLeadScore(lead)} />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={bookmarked ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={bookmarked}
              disabled={saving}
              onClick={() => void bookmark()}
            >
              <Star className={cn("size-3.5", bookmarked && "fill-amber-400 text-amber-400")} aria-hidden />
            </Button>
          </SheetTitle>
          <SheetDescription>
            {lead.username ? `@${lead.username}` : "Unknown handle"}
            {lead.location ? ` · ${lead.location}` : ""} · seen {lead.appearanceCount}{" "}
            {lead.appearanceCount === 1 ? "time" : "times"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          {/* Promoted to the top — "why is this lead first" is the single most
              important thing an agent needs on open, ahead of bio/contact
              fields that are just reference data. */}
          <section className="border-border bg-muted/30 rounded-xl border p-3">
            <h3 className="mb-1.5 text-sm font-semibold">Why this lead is at the top</h3>
            <p className="text-muted-foreground text-sm">{lead.aiExplanation || "No signal yet."}</p>
            {(lead.primaryAppearance?.scoreReasons.length ?? 0) > 0 && (
              <ScoreReasons
                reasons={lead.primaryAppearance!.scoreReasons}
                limit={6}
                showWeight
                className="mt-2"
              />
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
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
          </section>

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

          {hasAiAssist && <AiSummarySection lead={lead} />}
          {hasAiAssist && <MessageAssistant lead={lead} />}

          <LeadValidationSection leadId={lead.id} />

          <section className="grid grid-cols-2 gap-3 text-sm">
            <Field label={fieldLabels.wants} value={lead.propertyTypes.join(", ") || "—"} />
            <Field label="Where" value={lead.locations.join(", ") || "—"} />
            <Field
              label={fieldLabels.budget}
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

          <SimilarLeadsSection leadId={lead.id} onSelectLead={onSelectLead} />

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
            <h3 className="mb-1.5 text-sm font-semibold">Assignee</h3>
            <select
              aria-label={`Assignee for ${lead.name ?? "lead"}`}
              value={lead.assignedTo ?? ""}
              disabled={saving}
              onChange={(event) => void assign(event.target.value || null)}
              className="border-input bg-background w-full max-w-64 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <option value="">Unassigned</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name ?? member.email}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Deal value</h3>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={dealValue}
                onChange={(event) => setDealValueInput(event.target.value)}
                onBlur={() => void persistDealValue()}
                placeholder="e.g. 250000"
                className="max-w-40"
              />
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Actual closed value in USD — feeds the revenue and ROI figures on the Analytics page. Separate from
              this lead&rsquo;s own stated budget above.
            </p>
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

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Tags</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-muted text-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    disabled={saving}
                    onClick={() => removeTag(tag)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                disabled={saving}
                placeholder="Add a tag…"
                className="h-7 w-28 border-dashed text-xs"
              />
            </div>
          </section>

          <ActivityTimeline leadId={lead.id} />

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

/**
 * Plain-English read on this lead — who they are, what they want, how strong
 * the opportunity is, and a first-message angle — generated on demand and
 * cached on `leads.aiSummary` (see `application/leads/ai-assist.actions.ts`).
 * Only rendered when the company's plan has `aiAssistant` (checked by the
 * caller, not here — same "hide, don't show-then-bounce" rule as the rest of
 * this app's role/plan-gated UI).
 */
function AiSummarySection({ lead }: { lead: LeadListItem }) {
  const { busyId, run } = useServerAction();
  const busy = busyId === "ai-summary";
  const [summary, setSummary] = useState(lead.aiSummary);
  const [generatedAt, setGeneratedAt] = useState(lead.aiSummaryGeneratedAt);

  async function generate() {
    await run("ai-summary", () => generateLeadSummaryAction({ leadId: lead.id }), {
      errorFallback: "Could not generate a summary",
      invalidateKeys: [["leads"]],
      onSuccess: (result) => {
        setSummary(result.summary);
        setGeneratedAt(new Date());
      },
    });
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">AI summary</h3>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void generate()}>
          {busy && <Spinner className="size-3.5" />}
          {summary ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {summary ? (
        <>
          <p className="text-muted-foreground text-sm">{summary}</p>
          {generatedAt && (
            <p className="text-muted-foreground mt-1 text-[11px]">
              Generated <RelativeTime value={generatedAt} />
            </p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Not generated yet — a five-second read on this lead and a first-message angle.
        </p>
      )}
    </section>
  );
}

/**
 * Drafts a WhatsApp message — first-contact framing if nobody's reached this
 * lead yet, follow-up framing (referencing days since last contact and
 * current status) otherwise. "Send via WhatsApp" reuses the exact same
 * `markContacted` action and `wa.me` deep-link pattern `lead-inbox.tsx`'s row
 * actions use, so this is a second entry point into the same contact-logging
 * path, not a parallel one. The WhatsApp tab opens regardless of whether the
 * logging call itself succeeds — same reasoning as `lead-inbox.tsx::contact`:
 * the metric must not depend on the tab opening.
 */
function MessageAssistant({ lead }: { lead: LeadListItem }) {
  const { busyId, run } = useServerAction();
  const [draft, setDraft] = useState<string | null>(null);
  const drafting = busyId === "draft";
  const sending = busyId === "send";
  const mode = lead.firstContactedAt ? "follow-up" : "first message";

  async function generate() {
    await run("draft", () => generateMessageDraftAction({ leadId: lead.id }), {
      errorFallback: "Could not draft a message",
      onSuccess: (result) => setDraft(result.message),
    });
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    toast.success("Copied");
  }

  async function sendViaWhatsapp() {
    if (!draft) return;
    await run("send", () => markContacted({ leadId: lead.id, channel: "whatsapp" }), {
      errorFallback: "Contact logged locally but couldn't be saved — it may not count toward time-to-first-touch.",
      invalidateKeys: [["leads"]],
    });
    const phone = lead.contact.whatsapp?.replace(/\D/g, "");
    if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(draft)}`, "_blank", "noopener");
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Message assistant</h3>
        <Button size="sm" variant="outline" disabled={drafting} onClick={() => void generate()}>
          {drafting && <Spinner className="size-3.5" />}
          Draft {mode}
        </Button>
      </div>
      {draft && (
        <div className="flex flex-col gap-2">
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} />
          <p className="text-muted-foreground text-xs">
            Built from this lead&apos;s parsed signals. Always your words before it&apos;s sent — nothing is sent
            from AveronAi automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy()}>
              Copy
            </Button>
            <Button size="sm" disabled={!lead.contact.whatsapp || sending} onClick={() => void sendViaWhatsapp()}>
              {sending && <Spinner className="size-3.5" />}
              <MessageCircle className="size-3.5" aria-hidden />
              Send via WhatsApp
            </Button>
          </div>
        </div>
      )}
    </section>
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
        {isEngagement ? (
          <span className="text-muted-foreground text-xs italic">Context only — never scored</span>
        ) : (
          <ScoreBadge score={appearance.intentScore} />
        )}
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
const AFFILIATION_QUERY_KEYS = (leadId: string) =>
  [["leads", "affiliations", leadId], ["target-companies"]] as const;

function AffiliatedCompanies({ leadId }: { leadId: string }) {
  const { busyId, run } = useServerAction();
  const linking = busyId !== null;
  const { data: affiliations = [] } = useLeadAffiliationsQuery(leadId);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<(typeof AFFILIATION_ROLES)[number]>("unknown");
  const { data: suggestions = [] } = useTargetCompanySearchQuery(query);

  async function linkExisting(targetCompanyId: string, name: string) {
    await run("link", () => linkLeadToExistingCompany({ leadId, targetCompanyId, role }), {
      errorFallback: "Could not link that company",
      invalidateKeys: AFFILIATION_QUERY_KEYS(leadId),
      onSuccess: () => {
        setQuery("");
        toast.success(`Linked to ${name}`);
      },
    });
  }

  async function linkNew() {
    if (!query.trim()) return;
    const name = query.trim();
    await run("link", () => linkLeadToCompany({ leadId, companyName: name, role }), {
      errorFallback: "Could not link that company",
      invalidateKeys: AFFILIATION_QUERY_KEYS(leadId),
      onSuccess: () => {
        setQuery("");
        toast.success(`Linked to ${name}`);
      },
    });
  }

  async function unlink(affiliationId: string, name: string) {
    await run(`unlink-${affiliationId}`, () => unlinkLeadFromCompany({ leadId, affiliationId }), {
      errorFallback: "Could not unlink that company",
      invalidateKeys: AFFILIATION_QUERY_KEYS(leadId),
      onSuccess: () => toast.success(`Unlinked ${name}`),
    });
  }

  const exactMatch = suggestions.find((s) => s.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold">Affiliated companies</h3>
      {affiliations.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" data-testid="affiliated-companies-list">
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
                disabled={linking}
                onClick={() => void unlink(affiliation.id, affiliation.targetCompany.name)}
                className="text-muted-foreground hover:text-foreground rounded-full p-0.5 disabled:pointer-events-none disabled:opacity-50"
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
          onClick={() => void (exactMatch ? linkExisting(exactMatch.id, exactMatch.name) : linkNew())}
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
                disabled={linking}
                onClick={() => void linkExisting(suggestion.id, suggestion.name)}
                className="hover:bg-muted w-full rounded px-2 py-1 text-left text-xs disabled:pointer-events-none disabled:opacity-50"
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

/**
 * "Leads like this one" — reuses `getSimilarLeads`'s ranking (same
 * `priorityScore` formula the main inbox sorts by), not a new recommendation
 * model. Clicking a card swaps the open sheet to that lead via `onSelectLead`
 * (the same `setSelected` the inbox already uses to open a row) rather than
 * closing and reopening.
 */
function SimilarLeadsSection({
  leadId,
  onSelectLead,
}: {
  leadId: string;
  onSelectLead?: (lead: LeadListItem) => void;
}) {
  const { data: similar = [], isLoading } = useLeadSimilarQuery(leadId);
  if (!isLoading && similar.length === 0) return null;

  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold">Similar leads</h3>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {similar.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                disabled={!onSelectLead}
                onClick={() => onSelectLead?.(candidate)}
                className="border-border hover:bg-accent/40 flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm disabled:pointer-events-none"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <IntentBadge intent={candidate.leadType} />
                  <span className="truncate font-medium">{candidate.name ?? "Unknown"}</span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {candidate.locations[0] ?? candidate.propertyTypes[0] ?? ""}
                </span>
                <ScoreBadge score={primaryLeadScore(candidate)} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type EventMeta = {
  label: string;
  describe: (payload: Record<string, unknown> | null) => string | null;
  /** Only automation/system-driven event types carry a category pill — a human action needs no badge to explain itself. */
  category?: (payload: Record<string, unknown> | null) => string | null;
};

const EVENT_META: Record<string, EventMeta> = {
  created: { label: "Lead created", describe: () => null },
  status_changed: {
    label: "Status changed",
    describe: (payload) => (typeof payload?.status === "string" ? `→ ${leadStatusLabel(payload.status)}` : null),
  },
  assigned: {
    label: "Assignment changed",
    describe: (payload) => {
      if (!payload?.assignedTo) return "Unassigned";
      const ruleName = typeof payload.ruleName === "string" ? payload.ruleName : null;
      if (ruleName) return `Assigned to a teammate — rule "${ruleName}" matched`;
      if (payload.auto) return "Auto-assigned to a teammate";
      return "Assigned to a teammate";
    },
    category: (payload) => (payload?.auto ? "AUTOMATION" : null),
  },
  note_added: { label: "Note saved", describe: () => null },
  contacted: {
    label: "Contacted",
    describe: (payload) => (typeof payload?.channel === "string" ? `via ${payload.channel}` : null),
  },
  alerted: {
    label: "Alert sent",
    describe: (payload) =>
      typeof payload?.rule === "string" ? `"${payload.rule}"${typeof payload.channel === "string" ? ` · ${payload.channel}` : ""}` : null,
    category: () => "AUTOMATION",
  },
  reclassified: { label: "Re-scored", describe: () => null, category: () => "SCORING" },
  merged: {
    label: "Matched to this person",
    describe: (payload) =>
      typeof payload?.matchedField === "string" ? `by ${payload.matchedField}` : "identity match",
    category: () => "IDENTITY",
  },
  split: {
    label: "Merge split",
    describe: (payload) =>
      payload?.direction === "split_off" ? "one appearance moved to a new lead" : "split out from another lead",
    category: () => "IDENTITY",
  },
};

/**
 * Full history for this lead — status changes, assignment, notes, every
 * contact touch (not just the first), alerts sent, and identity merges — all
 * already written by existing actions (`lead.actions.ts`, `dispatch.ts`,
 * `identity-resolution.ts`). This is the first place any of it is shown.
 */
function ActivityTimeline({ leadId }: { leadId: string }) {
  const { data: events = [], isLoading } = useLeadEventsQuery(leadId);

  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold">Activity</h3>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing logged yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((event) => {
            const meta = EVENT_META[event.type] ?? { label: leadStatusLabel(event.type), describe: () => null };
            const detail = meta.describe(event.payload);
            const category = meta.category?.(event.payload);
            const splittableAppearanceId =
              event.type === "merged" && typeof event.payload?.appearanceId === "string"
                ? event.payload.appearanceId
                : null;
            return (
              <li key={event.id} className="flex flex-col gap-1 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {category && (
                      <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[9px] font-semibold tracking-wide">
                        {category}
                      </Badge>
                    )}
                    <span className="font-medium">{meta.label}</span>
                    {detail && <span className="text-muted-foreground">{detail}</span>}
                    {event.actorName && <span className="text-muted-foreground">· {event.actorName}</span>}
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {format(new Date(event.at), "d MMM, HH:mm")}
                  </span>
                </div>
                {splittableAppearanceId && <SplitMergeAction appearanceId={splittableAppearanceId} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * The one action a `merged` event carries — separates the appearance that
 * triggered this specific merge back into its own lead. Never touches any
 * other appearance this person has. See `application/leads/split-lead.ts`.
 */
function SplitMergeAction({ appearanceId }: { appearanceId: string }) {
  const { busyId, run } = useServerAction();
  const busy = busyId === appearanceId;

  async function split() {
    await run(appearanceId, () => splitMerge({ appearanceId }), {
      errorFallback: "Could not split this merge",
      invalidateKeys: [["leads"]],
      onSuccess: () => toast.success("Split into a new lead"),
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<button type="button" className="text-brand w-fit text-xs font-medium hover:underline" />}>
        Split this merge
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Split this merge?</AlertDialogTitle>
          <AlertDialogDescription>
            Separates this one appearance into its own lead. The rest of this person&apos;s appearances stay where
            they are. This doesn&apos;t delete anything, and both leads keep their full activity history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={() => void split()}>
            {busy && <Spinner className="size-3.5" />}
            Split
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
