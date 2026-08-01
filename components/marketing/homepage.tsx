import Link from "next/link";
import { ArrowRight, Bell, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Reveal } from "@/components/marketing/reveal";
import { LiveToast } from "@/components/marketing/live-toast";
import { HowItWorksDiagram } from "@/components/marketing/how-it-works-diagram";
import { cardHover } from "@/components/marketing/card-hover";
import { LeadMergeIcon, KanbanStripIcon, SchemaDriftIcon } from "@/components/marketing/diagram-icons";
import { RankedInboxMockup } from "@/components/marketing/mockups/ranked-inbox-mockup";
import { KanbanBoardMockup } from "@/components/marketing/mockups/kanban-board-mockup";
import { IntelligenceChartMockup } from "@/components/marketing/mockups/intelligence-chart-mockup";
import { AlertEmailMockup } from "@/components/marketing/mockups/alert-email-mockup";

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

export function Homepage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_55%_55%_at_50%_0%,color-mix(in_oklch,var(--brand)_16%,transparent),transparent)]"
          aria-hidden
        />
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Whoever replies first wins the deal
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg text-balance">
            Buyers announce intent in Bali Facebook and Instagram groups —{" "}
            <span className="text-foreground font-serif italic">
              &ldquo;looking to buy a villa in Canggu, budget $300k&rdquo;
            </span>{" "}
            — long before they reach an agent. DreamRue finds those posts, scores buyer intent, and routes them to
            your team fast enough to be the first responder.
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
          <LiveToast />
        </div>
      </section>

      <section className="bg-surface-alt border-border border-y">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              From a Facebook post to your first message
            </h2>
          </div>
          <div className="mt-12">
            <HowItWorksDiagram steps={HOW_IT_WORKS} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <Eyebrow>Built for the sales team</Eyebrow>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Not another feed to babysit</h2>
        </div>

        <div className="mt-14 flex flex-col gap-20">
          <Reveal className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <LeadMergeIcon className="text-brand mb-4" />
              <h3 className="text-xl font-semibold tracking-tight">Person-centric identity</h3>
              <p className="text-muted-foreground mt-2">
                The same account posting across groups, platforms, or as both an author and a commenter is one lead —
                matched deterministically on Facebook/Instagram ID, never fuzzy name-matching.
              </p>
              <h3 className="mt-6 text-xl font-semibold tracking-tight">Filter on anything</h3>
              <p className="text-muted-foreground mt-2">
                Lead type, status, property type, location, source group, budget range, contact availability, or any
                attribute discovered in your raw data.
              </p>
            </div>
            <div className={cardHover}>
              <RankedInboxMockup />
            </div>
          </Reveal>

          <Reveal className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className={`order-2 lg:order-1 ${cardHover}`}>
              <KanbanBoardMockup />
            </div>
            <div className="order-1 lg:order-2">
              <KanbanStripIcon className="text-brand mb-4" />
              <h3 className="text-xl font-semibold tracking-tight">Pipeline kanban</h3>
              <p className="text-muted-foreground mt-2">
                Drag a lead from new to contacted to closed, or update status and assignee inline, without leaving
                the board.
              </p>
            </div>
          </Reveal>

          <Reveal className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <LineChart className="text-brand mb-4 size-8" aria-hidden />
              <h3 className="text-xl font-semibold tracking-tight">Intelligence dashboard</h3>
              <p className="text-muted-foreground mt-2">
                Intent, location, property-type, source-group, and budget trends across the last 30 days — not just
                your current filter.
              </p>
            </div>
            <div className={cardHover}>
              <IntelligenceChartMockup />
            </div>
          </Reveal>

          <Reveal className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className={`order-2 lg:order-1 ${cardHover}`}>
              <AlertEmailMockup />
            </div>
            <div className="order-1 lg:order-2">
              <Bell className="text-brand mb-4 size-8" aria-hidden />
              <h3 className="text-xl font-semibold tracking-tight">Alerting that stays useful</h3>
              <p className="text-muted-foreground mt-2">
                Define who gets notified about which kind of lead, on which channel, and tune thresholds without a
                deploy. One digest per rule per sync run, not one email per lead.
              </p>
            </div>
          </Reveal>

          <Reveal className="border-border bg-card flex flex-col items-start gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center sm:gap-6">
            <SchemaDriftIcon className="text-accent-warm shrink-0" />
            <div>
              <h3 className="text-xl font-semibold tracking-tight">Sync health, not silent failure</h3>
              <p className="text-muted-foreground mt-2">
                When an upstream feed changes its field names, you get a schema-drift flag on that dataset instead of
                a pipeline quietly producing garbage.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-border bg-surface-alt border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
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
          <Button render={<Link href="/signup" />} variant="outline" className="mt-2">
            Start free trial
          </Button>
        </div>
      </section>
    </>
  );
}
