import Link from "next/link";
import {
  ArrowRight,
  Bell,
  KanbanSquare,
  LineChart,
  ListFilter,
  RadioTower,
  ShieldCheck,
  UserSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const HOW_IT_WORKS = [
  {
    title: "Connect your datasets",
    description:
      "Point it at your existing Apify actors, with n8n driving the schedule. New datasets are auto-discovered — no manual setup per feed.",
  },
  {
    title: "Every post gets scored",
    description:
      "Buyer intent, budget, location, and property type are extracted automatically, with the specific phrase or evidence behind each score.",
  },
  {
    title: "One inbox, ranked by priority",
    description:
      "Duplicate posts and cross-platform accounts merge into a single lead. The most contactable, most-recent buyer sits at the top by default.",
  },
  {
    title: "Your team gets there first",
    description:
      "Claim a lead, move it through the pipeline, and get alerted the moment a high-intent buyer shows up — before anyone else replies.",
  },
] as const;

const FEATURES = [
  {
    icon: UserSearch,
    title: "Person-centric identity",
    description:
      "The same account posting across groups, platforms, or as both an author and a commenter is one lead — matched deterministically on Facebook/Instagram ID, never fuzzy name-matching.",
  },
  {
    icon: ListFilter,
    title: "Filter on anything",
    description:
      "Lead type, status, property type, location, source group, budget range, contact availability, or any attribute discovered in your raw data.",
  },
  {
    icon: KanbanSquare,
    title: "Pipeline kanban",
    description: "Drag a lead from new to contacted to closed, or update status and assignee inline, without leaving the board.",
  },
  {
    icon: LineChart,
    title: "Intelligence dashboard",
    description: "Intent, location, property-type, source-group, and budget trends across the last 30 days — not just your current filter.",
  },
  {
    icon: Bell,
    title: "Alerting that stays useful",
    description: "Define who gets notified about which kind of lead, on which channel, and tune thresholds without a deploy. One digest per rule per sync run, not one email per lead.",
  },
  {
    icon: ShieldCheck,
    title: "Sync health, not silent failure",
    description: "When an upstream feed changes its field names, you get a schema-drift flag on that dataset instead of a pipeline quietly producing garbage.",
  },
] as const;

export function Homepage() {
  return (
    <>
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Whoever replies first wins the deal
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg text-balance">
          Buyers announce intent in Bali Facebook and Instagram groups — &ldquo;looking to buy a villa in Canggu,
          budget $300k&rdquo; — long before they reach an agent. DreamRue finds those posts, scores buyer intent,
          and routes them to your team fast enough to be the first responder.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button render={<Link href="/signup" />} size="lg">
            Start free trial
            <ArrowRight className="size-4" aria-hidden />
          </Button>
          <Button render={<Link href="/pricing" />} variant="outline" size="lg">
            See pricing
          </Button>
        </div>
      </section>

      <section className="border-border border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm font-semibold tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-semibold tracking-tight">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Built for the sales team, not another feed</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="border-border flex flex-col gap-3 rounded-2xl border p-6">
              <feature.icon className="text-brand size-5" aria-hidden />
              <h3 className="font-semibold tracking-tight">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
          <RadioTower className="text-brand size-6" aria-hidden />
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Works with the sources you already scrape</h2>
          <p className="text-muted-foreground max-w-2xl text-balance">
            Apify actors sync automatically on a schedule n8n drives; email and WhatsApp carry your alerts. See
            exactly
            what&rsquo;s live today on the{" "}
            <Link href="/integrations" className="text-foreground underline underline-offset-4">
              integrations page
            </Link>
            .
          </p>
          <Button render={<Link href="/signup" />} className="mt-2">
            Start free trial
          </Button>
        </div>
      </section>
    </>
  );
}
