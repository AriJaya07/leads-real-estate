import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { ScoredPostIcon } from "@/components/marketing/diagram-icons";
import { DocsNav, DocsToc } from "./docs-toc";

export const metadata: Metadata = { title: "Documentation" };

const PIPELINE_STAGES = [
  { n: "01", label: "Collect", body: "Apify actors scrape the Facebook/Instagram sources you register; n8n drives the schedule." },
  { n: "02", label: "Normalize & dedupe", body: "Raw payloads map onto a common lead shape; identity resolution merges appearances of the same person." },
  { n: "03", label: "Classify", body: "Every post is typed — buyer, seller, agent, broker, investor, other — with the phrase that drove it." },
  { n: "04", label: "Score", body: "Intent, budget clarity, recency and confidence roll up into a priority score that shows its reasons." },
  { n: "05", label: "Alert", body: "Rules on type, score, location or budget fire a digest to the agent who should see it." },
  { n: "06", label: "Work", body: "Ranked inbox for triage, kanban board for the week, notes and tags — deliberately not a CRM." },
  { n: "07", label: "Watch", body: "Sync health and schema drift surface upstream problems before your lead flow quietly dries up." },
] as const;

interface Concept {
  id: string;
  title: string;
  kicker: string;
  how: string;
  use: readonly string[];
  why: string;
}

const CONCEPTS: readonly Concept[] = [
  {
    id: "leads-are-people",
    title: "Leads are people, not posts",
    kicker: "Identity resolution",
    how: "The same Facebook or Instagram account posting in multiple groups — or showing up as both a post author and someone who liked a listing — is merged into one lead, with every source it was found in listed underneath. Matching is deterministic: it only merges on an exact Facebook ID, Instagram ID, or profile URL, never on similar-looking names or photos. A wrong merge is worse than a duplicate, so AveronAi never guesses.",
    use: [
      "Open a lead's detail sheet and check \"Sources\" — every appearance that fed the merge is listed, so you can verify the merge yourself.",
      "If someone looks like a duplicate but wasn't merged, that's deliberate: the matching signal wasn't strong enough. Nothing merges on a hunch.",
    ],
    why: "An agent who can't tell if two rows are the same person either wastes a call on someone already contacted, or misses that a \"new\" lead has already been talked to twice. One clean profile per person means every note, tag and contact-touch lives in the same place — the record your team actually trusts.",
  },
  {
    id: "scoring-and-ranking",
    title: "Scoring and ranking",
    kicker: "Priority engine",
    how: "Every post is classified as buyer, seller, agent, or other intent, with the specific phrase or budget mention that drove the score attached as the reason. At the person level, those appearances roll up into a buyer/seller/investor/broker score and a confidence score — a second and third corroborating post matters far more than a tenth. Likes and comments are shown as context and never move the score. The inbox defaults to the highest-priority, most-recently-active buyer at the top.",
    use: [
      "Sort the inbox by \"priority\" (the default) to see the score at work, or switch to \"newest\"/\"buyerScore\" when you specifically need chronological or single-axis order.",
      "Open a lead and read \"Why this lead is at the top\" — every point on the score is attributed to a concrete signal, not a black box.",
      "Filter by minimum buyer score or confidence when your team only has time to work the top slice of a busy day.",
    ],
    why: "Every agency has more posts than agent-hours. Scoring turns \"read everything\" into \"read the ten posts most likely to close,\" and because every point is explained, your team can argue with a score instead of blindly trusting or ignoring it — which is what actually builds trust in the ranking over time.",
  },
  {
    id: "pipeline",
    title: "Pipeline and the kanban board",
    kicker: "Working the deal",
    how: "A lead moves left to right through new → contacted → qualified → interested → negotiation → closed, with rejected as a separate terminal state for posts that turned out to be trade, not a real buyer. The pipeline board shows one column per status; dragging a card between columns changes its status immediately, with a dropdown fallback on every card for keyboard and mobile use. Below tablet width the board becomes one column at a time behind a status tab strip.",
    use: [
      "Use the inbox for triage (\"what's new today\") and the pipeline board for management (\"what's my team actively working, and where is it stuck\").",
      "Toggle \"My leads\" or pick an agent from the picker to see one person's board instead of the whole team's.",
      "A card sitting in one status for a long time is a signal on its own — the elapsed-time badge tints from neutral to warning to bad the longer a new lead goes untouched.",
    ],
    why: "A ranked list tells you who to call next; a board tells you where the whole pipeline is thin or clogged. Watching stage-to-stage movement — not just today's inbox count — is how a sales lead spots a bottleneck (e.g. plenty of \"contacted,\" almost nothing reaching \"qualified\") before it shows up as a bad month in revenue.",
  },
  {
    id: "alert-rules",
    title: "Alert rules",
    kicker: "Never miss a hot buyer",
    how: "Admins define who gets notified about which kind of lead, on which channel (email or WhatsApp), using a rule made of comparisons like \"buyer score above 70\" or \"location is Canggu.\" Thresholds are edited from the admin UI, not a deploy. The whole team gets one digest per matching rule per sync run, not one message per lead — forty pings in five minutes gets a channel muted, and a muted channel is worth nothing.",
    use: [
      "Start with one broad rule (e.g. \"any buyer above score 70\") before building narrow, area-specific rules — a rule with no matches yet is invisible, so it's easy to end up with rules nobody remembers exist.",
      "Point a rule's recipients at the agent who owns that area, not the whole team, once you have enough volume that everyone-gets-everything stops being useful.",
      "Check Admin → Alerts' recent activity to see which rules are actually firing — a rule that never matches is either too narrow or watching the wrong signal.",
    ],
    why: "The whole product's promise is \"whoever replies first wins the deal.\" A hot lead that sits in the inbox until someone happens to refresh the page is a lost deal to a faster competitor. Alerting is what turns a ranked list into a same-minute notification, which is the entire reason median time-to-first-touch is the product's headline metric.",
  },
  {
    id: "automation",
    title: "Automation and webhooks",
    kicker: "Less manual triage",
    how: "Beyond alerting, three automations run on a schedule: auto-assign round-robins newly-unassigned leads across current team members so nothing sits unowned; stale-lead reminders digest anything that's sat untouched in an active pipeline status past a threshold; and a weekly report emails an aggregate performance summary. Separately, WHEN/THEN routing rules can auto-assign a lead by area (\"a buyer in Canggu goes to Agus\") or auto-hide known trade accounts (brokers, other agents) so they never clutter the inbox. An outbound webhook — one URL and HMAC-signed secret per company — fires on lead updates, status changes, alert-rule matches, and alert sends, for syncing into a CRM or Zapier-style tool you already use.",
    use: [
      "Turn on auto-assign once you have more than one agent working the same source — it removes the \"who's grabbing this one\" scramble entirely.",
      "Set the stale-lead reminder threshold to whatever \"too long without a reply\" means for your team — a few hours for hot inbound, a few days for a slower segment.",
      "Configure the webhook from Admin → Automation if you already have a CRM; check the delivery log there rather than guessing whether it's working.",
    ],
    why: "Rules that run without a human clicking anything are what let a four-person team behave like it has an ops coordinator. Auto-assign and auto-hide alone remove two of the most common causes of a slow or duplicated response: nobody owning a lead, and agents wasting attention on posts that were never a real buyer.",
  },
  {
    id: "intelligence-analytics",
    title: "Intelligence vs. Analytics",
    kicker: "Two different questions",
    how: "Intelligence answers \"what is the market telling us\" — leads by intent per day, where demand is concentrated by area, budget bands, and source mix, using the same intent colors as the inbox everywhere so a buyer is blue on every chart, never remapped. Analytics answers \"how is the business doing\" — conversion funnel from new to closed, revenue and ROI against plan cost, and performance broken down by source and by agent, including the company-wide median time-to-first-touch.",
    use: [
      "Reach for Intelligence when deciding where to point a new source or agent — which area, which property type, which budget band is actually producing demand right now.",
      "Reach for Analytics when reporting upward — did the leads convert, what did they cost against the plan, which agents and sources are actually performing.",
      "Both default to the last 30 days with a 7/30/90-day toggle, so a one-off spike doesn't get mistaken for a trend.",
    ],
    why: "Market-signal and business-outcome are genuinely different decisions with different owners — a founder deciding where to expand sourcing needs Intelligence; the same founder justifying the plan's ROI to a partner needs Analytics. Splitting the two into pages that answer one clean question each, instead of one dashboard trying to answer both, is what keeps either one from being fifteen half-relevant charts.",
  },
  {
    id: "sync-health",
    title: "Sync health and schema drift",
    kicker: "Trust the data before it trusts you",
    how: "New datasets from your connected Apify actors or n8n feeds show up automatically — nobody configures a new feed by hand. Each sync run is logged with its record counts and outcome. If an upstream source changes its field names, that dataset is flagged as schema drift instead of silently producing bad data, and a human reviews the mapping before it's trusted again.",
    use: [
      "Check Admin → Sync after connecting a new source for the first time — a healthy first run should show records landing, not zero.",
      "Treat a schema-drift flag as a to-do, not an emergency: the affected dataset pauses being trusted, it doesn't take the rest of the product down.",
      "Review a flagged mapping profile before approving it — that's the one manual step standing between a shape change and bad data reaching your team.",
    ],
    why: "A silent upstream change is the failure mode that costs the most trust: your lead count looks normal, but the field that used to carry \"budget\" is now empty, and nobody notices until a quarter of pipeline reports \"no budget stated.\" Surfacing drift loudly, before it corrupts scoring, is what makes it safe to plug in scrapers you don't control the shape of.",
  },
  {
    id: "roles",
    title: "Team roles",
    kicker: "Who can do what",
    how: "Four roles, each a strict superset of the one below: a member works the inbox and pipeline — filters, claims, contacts, notes, tags. A manager can also trigger data collection and manage shared saved searches, and gets access to Intelligence and Analytics. An admin can also manage the team, review dataset mapping profiles, monitor sync health, and configure alert rules, automation and API keys. An owner can also change the company's plan and grant ownership to someone else.",
    use: [
      "Invite most of a sales team as members — the inbox and pipeline are all day-to-day selling actually needs.",
      "Promote whoever is watching source performance and reporting upward to manager, so they can see Intelligence/Analytics without needing admin access to settings.",
      "Keep admin to the one or two people actually configuring sources, alerts and integrations — every extra admin is one more person who can change a threshold the whole team depends on.",
    ],
    why: "Spend decisions (billing) stay with the owner, configuration stays with admins, market/business reporting opens up to managers, and triage stays with agents — matching access to responsibility is what lets you add a fifth, tenth, twentieth teammate without every new hire needing a walkthrough of settings they'll never touch.",
  },
  {
    id: "billing-plans",
    title: "Billing and plans",
    kicker: "What actually gets enforced",
    how: "Starter, Professional, Business and Enterprise each carry real, enforced limits — seats, datasets, monthly raw records ingested, monthly unique leads, alert rules, and (Professional and up) API rate limits. A downgrade is only allowed if current usage already fits inside the target plan's limits — you can't accidentally downgrade into a state that silently drops data. Nothing is deleted on downgrade either: access degrades (collection pauses, seats lock) and the leads stay yours, restored the moment you upgrade again.",
    use: [
      "Check Admin → Billing's usage bars before a plan change — they show exactly which limit would block a downgrade, if any.",
      "Treat \"unlimited\" fields (seats and alert rules on Enterprise) differently from the fixed ceilings (storage, records fetched, Apify requests) — the latter map to real infrastructure cost even on the top tier.",
      "Watch the monthly usage counters, not just the current-moment counts — records-ingested-this-month resets on a calendar boundary, seats and datasets don't.",
    ],
    why: "A limit you can't see coming is how a growing team gets blindsided mid-month. Showing the real, enforced numbers — not marketing round numbers — is what lets an owner plan a plan change proactively instead of discovering a ceiling by hitting it.",
  },
  {
    id: "api-integrations",
    title: "API and integrations",
    kicker: "Beyond the app",
    how: "A read-only leads API and outbound webhooks, both bearer-token authenticated, let another system read the same ranked, deduplicated data your team works in the app — see the full contract in the API reference. Facebook and Instagram are the live data sources today; the connector layer is built so a new source (LinkedIn, a CRM) becomes a registered connector, not a new product.",
    use: [
      "Reach for the API when a lead needs to land in a CRM you already run day-to-day, rather than duplicating pipeline management in two places.",
      "Reach for webhooks when you want the CRM to react the moment a lead matches an alert rule, instead of a periodic sync pulling on a schedule.",
      "Check the integrations page for what's live, what's plan-gated, and what's still roadmap — the honest version of a comparison table.",
    ],
    why: "\"Is this a CRM?\" is a question worth answering directly: no, and it's not trying to become one. The API and webhooks exist so a lead never gets lost between AveronAi and whatever system your team already lives in for deal management, invoicing, or deeper contact history.",
  },
] as const;

function ConceptSection({ concept }: { concept: Concept }) {
  return (
    <div id={concept.id} className="border-border scroll-mt-24 border-b pb-12 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        {concept.id === "scoring-and-ranking" && <ScoredPostIcon className="text-brand mt-1 shrink-0" />}
        <div>
          <div className="font-mono text-[10.5px] font-medium tracking-wide text-brand uppercase">{concept.kicker}</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{concept.title}</h2>
        </div>
      </div>

      <p className="text-muted-foreground mt-4 max-w-2xl text-[15px] leading-relaxed">{concept.how}</p>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-foreground/80 text-xs font-semibold tracking-wide uppercase">How to use it</h3>
          <ul className="text-muted-foreground mt-2 flex flex-col gap-1.5 text-sm leading-relaxed">
            {concept.use.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-brand mt-1.5 block size-1 shrink-0 rounded-full bg-current" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-border bg-muted/30 rounded-xl border p-4">
          <h3 className="text-foreground/80 text-xs font-semibold tracking-wide uppercase">Why it matters</h3>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{concept.why}</p>
        </div>
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-12">
        <Eyebrow>Documentation</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">How AveronAi works</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-balance text-[15px] leading-relaxed">
          How AveronAi turns raw social posts into a ranked, workable lead inbox — what each part of the system
          does, how to use it day to day, and why it&rsquo;s built this way. For the onboarding walkthrough, see the{" "}
          <Link href="/docs/guide" className="text-foreground underline underline-offset-4">
            step-by-step guide
          </Link>
          .
        </p>
      </div>

      <div className="flex gap-12">
        <DocsNav active="Overview" />

        <div className="min-w-0 flex-1">
          <section aria-labelledby="pipeline-overview-heading" className="mb-14">
            <h2 id="pipeline-overview-heading" className="text-lg font-semibold tracking-tight">
              The pipeline, end to end
            </h2>
            <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
              Seven stages run between a stranger&rsquo;s post and your agent&rsquo;s first message. Every section
              below is one of these stages, in depth.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage.n} className="border-border rounded-xl border p-4">
                  <div className="font-mono text-xs text-brand">{stage.n}</div>
                  <div className="mt-1.5 text-sm font-medium">{stage.label}</div>
                  <div className="text-muted-foreground mt-1 text-xs leading-relaxed">{stage.body}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-12">
            {CONCEPTS.map((concept) => (
              <ConceptSection key={concept.id} concept={concept} />
            ))}
          </div>
        </div>

        <DocsToc entries={CONCEPTS.map(({ id, title }) => ({ id, label: title }))} />
      </div>
    </div>
  );
}
