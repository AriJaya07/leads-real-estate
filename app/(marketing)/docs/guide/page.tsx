import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { DocsNav, DocsToc } from "../docs-toc";

export const metadata: Metadata = { title: "Step-by-step guide" };

interface Step {
  title: string;
  body: string;
  detail?: readonly string[];
}

const STEPS: readonly Step[] = [
  {
    title: "Connect your first dataset",
    body: "Point DreamRue at your existing Apify actors, with n8n driving the schedule. Once a source is registered, every dataset it produces is auto-discovered — you don't configure feeds one by one.",
    detail: [
      "From Admin → Collect data, register the actor and let the first run complete before touching anything else.",
      "Check Admin → Sync afterward — a healthy first run shows records landing, not zero.",
    ],
  },
  {
    title: "Review the mapping profile",
    body: "New datasets get an auto-generated mapping profile that projects the raw payload onto DreamRue's lead fields, held for admin review unless confidence is high. Our team helps tune mapping for unusual feed shapes — there's no self-serve visual editor yet, so reach out on the contact page if a dataset needs adjustment.",
    detail: [
      "A profile held for review isn't broken — it's just not auto-approved yet. Leads still land, they're just not guaranteed-accurate until someone confirms the mapping.",
      "If a dataset later gets flagged for schema drift, this is the same review step, re-triggered.",
    ],
  },
  {
    title: "Set your alert rules and channels",
    body: "From Admin → Alerts, define what counts as a hot lead (e.g. buyer score above a threshold, in a specific location) and who gets notified, by email or WhatsApp. You'll get one digest per matching rule per sync run, not one message per lead.",
    detail: [
      "Start with one broad rule before narrowing by area or property type — a rule with zero matches is invisible, so it's easy to forget it exists.",
      "Point recipients at the agent who owns that area once you have enough volume that \"everyone gets everything\" stops being useful.",
    ],
  },
  {
    title: "Turn on automation",
    body: "From Admin → Automation, turn on auto-assign to round-robin newly-unassigned leads across your current team, and set a stale-lead reminder threshold so nothing sits untouched past whatever \"too long\" means for your team. A weekly report email gives whoever's not living in the dashboard an aggregate summary. If you already run a CRM, configure the outbound webhook here too.",
    detail: [
      "Auto-assign only rotates across members currently on the team — leaving is handled automatically, you don't need to manually re-balance.",
      "The webhook fires on lead updates, status changes, alert-rule matches, and alert sends — check the delivery log on this page rather than guessing whether it's reaching your CRM.",
    ],
  },
  {
    title: "Work the inbox",
    body: "Leads arrive ranked by priority by default — the most contactable, most-real, most-recently-active buyer at the top. Filter by type, status, location, budget, or any discovered attribute; claim a lead, mark it contacted, and move it through the pipeline as new → contacted → qualified → interested → negotiation → closed (or rejected).",
    detail: [
      "Open a lead and read \"Why this lead is at the top\" before calling — it's a five-second briefing, not just a score.",
      "Use ⌘K to jump straight to a lead, a saved search, or a dataset without leaving the keyboard.",
    ],
  },
  {
    title: "Use the pipeline board",
    body: "The kanban board lets you drag a lead between statuses without opening it, with a dropdown fallback on every card for keyboard use. Toggle \"My leads\" to see just your own board, or pick an agent to review theirs.",
    detail: [
      "A card that's aged into the warning color in \"New\" is the same triage signal as an inbox filter — don't wait for someone to notice it manually.",
    ],
  },
  {
    title: "Read Intelligence and Analytics",
    body: "Intelligence shows market-signal trends — leads by intent per day, where demand concentrates by area, budget bands, source mix. Analytics shows business outcomes — conversion funnel, revenue and ROI against plan cost, and performance by source and by agent, including the company-wide median time-to-first-touch. Both need a manager role or above.",
    detail: [
      "Use Intelligence to decide where to point a new source or agent; use Analytics to report whether the leads actually converted.",
      "Both default to a 30-day window with a 7/30/90-day toggle — check more than one window before calling something a trend.",
    ],
  },
  {
    title: "Invite your team and assign roles",
    body: "Admins add teammates from Admin → Team with a one-time temporary password — no external email provider required to sign in for the first time. The first person to sign in on a fresh instance becomes the owner. Roles are member, manager, admin and owner, each a strict superset of the one below — pick the lowest role that covers what someone actually needs to do.",
    detail: [
      "Most of a sales team should be members — the inbox and pipeline are all day-to-day selling needs.",
      "Keep admin to whoever actually configures sources, alerts and integrations. Only the owner can change the plan or grant ownership.",
    ],
  },
  {
    title: "Connect the API and webhooks",
    body: "If a lead needs to land in a CRM you already run, create a bearer-token key from Admin → API keys and read the leads API's filter parameters in the API reference — it's the same filtering the inbox uses. Webhooks (configured in the automation step above) push events the moment they happen instead of waiting on a periodic pull.",
    detail: [
      "A key is shown once, at creation — copy it immediately, since only a hash is stored afterward.",
      "Revoking a key takes effect immediately, with no grace period — useful if a script or integration is being retired.",
    ],
  },
  {
    title: "Manage billing as you grow",
    body: "Admin → Billing shows real usage against your plan's limits — seats, datasets, records ingested this month, alert rules. A plan change (owner-only) is blocked if current usage wouldn't fit the target plan, so you can't accidentally downgrade into data loss; nothing is deleted on downgrade either, access just degrades until you upgrade again.",
    detail: [
      "Check the usage bars before requesting a downgrade — they show exactly which limit would block it, if any.",
      "Enterprise's \"unlimited\" fields (seats, alert rules) are a real product decision, not a display quirk — everything else stays a fixed ceiling because it maps to real infrastructure cost.",
    ],
  },
] as const;

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>Step-by-step guide</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">From signup to running the business</h1>
        <p className="text-muted-foreground mt-3 text-balance text-[15px] leading-relaxed">
          What actually happens between signing up and your team running its pipeline, alerts, reporting and
          integrations day to day. For the concepts behind each step, see the{" "}
          <Link href="/docs" className="text-foreground underline underline-offset-4">
            documentation
          </Link>
          .
        </p>
      </div>

      <div className="mt-12 flex gap-12">
        <DocsNav active="User guide" />

        <ol className="relative mx-auto flex max-w-2xl min-w-0 flex-1 flex-col gap-10">
          <div className="bg-border absolute top-5 bottom-5 left-5 w-px" aria-hidden />
          {STEPS.map((step, index) => {
            const id = `step-${index + 1}`;
            return (
              <li key={step.title} id={id} className="relative flex scroll-mt-24 gap-5">
                <span className="border-brand bg-background text-brand relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-serif text-sm font-semibold italic">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 pt-1.5">
                  <h2 className="font-semibold tracking-tight">{step.title}</h2>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{step.body}</p>
                  {step.detail && (
                    <ul className="text-muted-foreground mt-2.5 flex flex-col gap-1.5 text-[13px] leading-relaxed">
                      {step.detail.map((line) => (
                        <li key={line} className="flex gap-2">
                          <span className="text-brand mt-1.5 block size-1 shrink-0 rounded-full bg-current" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <DocsToc entries={STEPS.map((step, index) => ({ id: `step-${index + 1}`, label: step.title }))} />
      </div>
    </div>
  );
}
