import type { Metadata } from "next";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Integrations" };

const INTEGRATIONS = [
  {
    name: "Apify",
    status: "live" as const,
    description:
      "The primary data connector: connect your Facebook/Instagram scraper actors and every dataset they produce is auto-discovered and synced — nobody configures a new feed by hand.",
  },
  {
    name: "n8n",
    status: "live" as const,
    description:
      "Used as the external scheduler and the orchestration layer for your Apify actors — trigger discovery, sync, reminders, FX refresh, and retention on a cadence via secured trigger endpoints, and drive the actor runs that produce your datasets.",
  },
  {
    name: "Email alerts",
    status: "live" as const,
    description: "Digest emails for matching alert rules, one per rule per sync run rather than one per lead.",
  },
  {
    name: "WhatsApp alerts",
    status: "plan-gated" as const,
    description:
      "Available on paid plans — the channel built for what actually gets read on a weekend. Requires connecting a WhatsApp Cloud API number for your workspace.",
  },
  {
    name: "Single sign-on (SSO)",
    status: "coming-soon" as const,
    description: "Listed on our plans, not yet built. Reach out if this is a blocker for your team.",
  },
] as const;

const STATUS_LABEL: Record<(typeof INTEGRATIONS)[number]["status"], string> = {
  live: "Live",
  "plan-gated": "Paid plans",
  "coming-soon": "Coming soon",
};

export default function IntegrationsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Integrations</h1>
        <p className="text-muted-foreground mt-3 text-balance">
          What&rsquo;s live today, what&rsquo;s gated to a plan, and what&rsquo;s still on the roadmap — no
          surprises after you sign up.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {INTEGRATIONS.map((integration) => (
          <div key={integration.name} className="border-border flex flex-col gap-2 rounded-2xl border p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold tracking-tight">{integration.name}</h2>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  integration.status === "live" && "bg-brand/10 text-brand",
                  integration.status === "plan-gated" && "bg-accent text-accent-foreground",
                  integration.status === "coming-soon" && "text-muted-foreground",
                )}
              >
                {integration.status === "live" ? (
                  <Check className="size-3" aria-hidden />
                ) : (
                  <Clock className="size-3" aria-hidden />
                )}
                {STATUS_LABEL[integration.status]}
              </span>
            </div>
            <p className="text-muted-foreground text-sm">{integration.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
