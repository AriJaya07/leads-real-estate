import type { Metadata } from "next";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/marketing/eyebrow";

export const metadata: Metadata = { title: "Integrations" };

const INTEGRATIONS = [
  {
    name: "Apify",
    category: "Data source",
    status: "live" as const,
    description:
      "The primary data connector: connect your Facebook/Instagram scraper actors and every dataset they produce is auto-discovered and synced — nobody configures a new feed by hand.",
  },
  {
    name: "n8n",
    category: "Orchestration",
    status: "live" as const,
    description:
      "Used as the external scheduler and the orchestration layer for your Apify actors — trigger discovery, sync, reminders, FX refresh, and retention on a cadence via secured trigger endpoints, and drive the actor runs that produce your datasets.",
  },
  {
    name: "Email alerts",
    category: "Alerts",
    status: "live" as const,
    description: "Digest emails for matching alert rules, one per rule per sync run rather than one per lead.",
  },
  {
    name: "WhatsApp alerts",
    category: "Alerts",
    status: "plan-gated" as const,
    description:
      "Available on paid plans — the channel built for what actually gets read on a weekend. Requires connecting a WhatsApp Cloud API number for your workspace.",
  },
  {
    name: "Single sign-on (SSO)",
    category: "Auth",
    status: "coming-soon" as const,
    description: "Listed on our plans, not yet built. Reach out if this is a blocker for your team.",
  },
] as const;

const STATUS_LABEL: Record<(typeof INTEGRATIONS)[number]["status"], string> = {
  live: "Live",
  "plan-gated": "Paid plans",
  "coming-soon": "Coming soon",
};

function StatusBadge({ status }: { status: (typeof INTEGRATIONS)[number]["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "live" && "bg-brand/10 text-brand",
        status === "plan-gated" && "bg-accent-warm/15 text-accent-warm",
        status === "coming-soon" && "bg-muted text-muted-foreground",
      )}
    >
      {status === "live" ? <Check className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <div className="text-center">
          <Eyebrow>Integrations</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">What connects to AveronAi</h1>
          <p className="text-muted-foreground mt-3 text-balance">
            What&rsquo;s live today, what&rsquo;s gated to a plan, and what&rsquo;s still on the roadmap — no
            surprises after you sign up.
          </p>
        </div>

        {/*
         * No horizontal scroll / no forced min-width: on a narrow viewport a
         * scrolled-off column just reads as a blank gap under each row, since
         * the row height is set by wrapped text nobody can see. Instead let
         * the table reflow — hide the least-essential column below `sm` and
         * let every cell wrap within the viewport.
         */}
        <div className="border-border overflow-hidden rounded-2xl border">
          {/*
           * `table-fixed` + `break-words`: with the default `table-layout:
           * auto`, an unbroken cell value (e.g. "Single sign-on (SSO)") has
           * no space to wrap at, so the browser widens the whole table past
           * its container instead — the exact horizontal overflow the
           * comment above says this table avoids. Fixed layout makes every
           * column strictly respect the table's own width, and `break-words`
           * lets a too-long word itself wrap rather than push the cell wider.
           */}
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-border bg-surface-alt border-b text-left">
                <th className="w-2/5 px-4 py-3 font-semibold sm:w-1/4 sm:px-5">Integration</th>
                <th className="hidden px-5 py-3 font-semibold sm:table-cell sm:w-1/6">Category</th>
                <th className="w-24 px-4 py-3 font-semibold sm:w-32 sm:px-5">Status</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Description</th>
              </tr>
            </thead>
            <tbody>
              {INTEGRATIONS.map((integration, i) => (
                <tr
                  key={integration.name}
                  className={cn("border-border border-b last:border-0", i % 2 === 1 && "bg-surface-alt/40")}
                >
                  <td className="px-4 py-4 align-top font-medium break-words sm:px-5">{integration.name}</td>
                  <td className="text-muted-foreground hidden px-5 py-4 align-top sm:table-cell">{integration.category}</td>
                  <td className="px-4 py-4 align-top sm:px-5">
                    <StatusBadge status={integration.status} />
                  </td>
                  <td className="text-muted-foreground px-4 py-4 align-top leading-relaxed break-words sm:px-5">{integration.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
