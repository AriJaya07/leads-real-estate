"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ExternalLink, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IntentBadge } from "@/components/common/intent-badge";
import { ScoreBadge } from "@/components/common/score-badge";
import { saveLeadNotes, setLeadStatus } from "@/application/leads/lead.actions";
import type { LeadListItem } from "@/application/leads/lead-queries";

const STATUSES = [
  "new",
  "contacted",
  "qualified",
  "viewing_booked",
  "converted",
  "lost",
  "archived",
] as const;

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
  const [notes, setNotes] = useState(lead.notes);
  const [saving, setSaving] = useState(false);

  async function update(status: (typeof STATUSES)[number]) {
    setSaving(true);
    await setLeadStatus({ leadId: lead.id, status });
    setSaving(false);
    router.refresh();
  }

  async function persistNotes() {
    if (notes === lead.notes) return;
    setSaving(true);
    await saveLeadNotes({ leadId: lead.id, notes });
    setSaving(false);
    router.refresh();
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <IntentBadge intent={lead.intent} />
            {lead.authorName ?? "Unknown"}
            <ScoreBadge score={lead.intentScore} />
          </SheetTitle>
          <SheetDescription>
            {lead.sourceGroup ?? "Unknown source"} ·{" "}
            {format(new Date(lead.postedAt), "d MMM yyyy, HH:mm")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          {lead.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {lead.images.slice(0, 6).map((src) => (
                // Plain <img>: these are signed CDN URLs that expire, so the
                // optimizer would cache a URL that stops resolving.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  loading="lazy"
                  className="border-border h-28 w-40 shrink-0 rounded-lg border object-cover"
                />
              ))}
            </div>
          )}

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Post</h3>
            {lead.listingTitle && <p className="mb-1 text-sm font-medium">{lead.listingTitle}</p>}
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {lead.body || "(no text)"}
            </p>
          </section>

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Why it scored {lead.intentScore}</h3>
            <ul className="flex flex-col gap-1">
              {lead.scoreReasons.map((reason) => (
                <li
                  key={reason.code + reason.label}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className={reason.weight < 0 ? "text-destructive" : undefined}>
                    {reason.label}
                    {reason.evidence && (
                      <span className="text-muted-foreground"> — “{reason.evidence}”</span>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                    {reason.weight > 0 ? "+" : ""}
                    {reason.weight}
                  </span>
                </li>
              ))}
              {lead.scoreReasons.length === 0 && (
                <li className="text-muted-foreground text-sm">No signals detected.</li>
              )}
            </ul>
          </section>

          <section className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Wants" value={lead.propertyTypes.join(", ") || "—"} />
            <Field label="Where" value={lead.locations.join(", ") || "—"} />
            <Field label="Bedrooms" value={lead.bedrooms?.toString() ?? "—"} />
            <Field label="Quality" value={`${lead.qualityScore}/100`} />
            <Field label="WhatsApp" value={lead.contact.whatsapp ?? "—"} />
            <Field label="Phone" value={lead.contact.phone ?? "—"} />
            <Field label="Email" value={lead.contact.email ?? "—"} />
            <Field label="Engagement" value={`${lead.reach} reach`} />
          </section>

          {Object.keys(lead.attributes).length > 0 && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold">Source fields</h3>
              <p className="text-muted-foreground mb-2 text-xs">
                Discovered in the payload and preserved automatically — these are filterable
                without any code change.
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {Object.entries(lead.attributes)
                  .slice(0, 12)
                  .map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-muted-foreground truncate">{key}</dt>
                      <dd className="truncate">{String(value).slice(0, 60)}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}

          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Status</h3>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={lead.status === status ? "default" : "outline"}
                  disabled={saving}
                  onClick={() => void update(status)}
                >
                  {status.replace(/_/g, " ")}
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

          <div className="flex items-center gap-2">
            {lead.externalUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(lead.externalUrl as string, "_blank", "noopener")}
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Original post
              </Button>
            )}
            {saving && <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
