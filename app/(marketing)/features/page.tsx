import type { Metadata } from "next";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Features" };

interface Stage {
  stage: string;
  title: string;
  body: string;
  intents?: boolean;
}

const STAGES: Stage[] = [
  {
    stage: "01 · 02 COLLECT",
    title: "Sources you pick",
    body: "Point us at the groups, pages and hashtags your buyers actually use. Collection runs on your schedule and stops when your plan's request budget says so — no surprise bills.",
  },
  {
    stage: "03 · 04 NORMALISE",
    title: "One lead, not ten duplicates",
    body: "Raw records are mapped into a single shape, then identity resolution joins appearances of the same person across sources — on confirmed signals only. You will never be shown a \"possible duplicate\" to adjudicate.",
  },
  {
    stage: "05 · 06 CLASSIFY",
    title: "Intent, budget, location",
    body: "Every lead is typed and every type keeps the same colour and the same word, everywhere in the product.",
    intents: true,
  },
  {
    stage: "07 SCORE",
    title: "Scores you can argue with",
    body: "Priority is built from stated intent, budget clarity, recency and confidence — and it shows its working on every lead. Likes and comments are shown as context and never move the score.",
  },
  {
    stage: "08 ALERT",
    title: "Never miss a hot buyer",
    body: "Rules on any combination of type, score, budget and area. Instant or digest, to email or WhatsApp, to the agent who owns that patch.",
  },
  {
    stage: "09 WORK",
    title: "Inbox and pipeline",
    body: "A ranked inbox for triage, a six-column board for the week. Status, assignee, notes and tags — deliberately not a CRM.",
  },
  {
    stage: "10 WATCH",
    title: "Sync health in the open",
    body: "Run history, record counts and schema-drift warnings. If a source changes shape, you find out from us, not from a quiet week.",
  },
] as const;

const INTENT_BADGES = [
  { label: "Buyer", className: "bg-intent-buyer/15 text-intent-buyer" },
  { label: "Seller", className: "bg-intent-seller/15 text-intent-seller" },
  { label: "Agent", className: "bg-intent-agent/15 text-intent-agent" },
  { label: "Broker", className: "bg-intent-broker/15 text-intent-broker" },
  { label: "Investor", className: "bg-intent-investor/15 text-intent-investor" },
  { label: "Other", className: "bg-intent-other/15 text-intent-other" },
] as const;

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-12 max-w-2xl">
        <Eyebrow>Features</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          From a post in a Facebook group to a reply in ten minutes
        </h1>
        <p className="text-muted-foreground mt-3 text-balance">
          Ten stages run between a stranger&rsquo;s post and your agent&rsquo;s first message. Here&rsquo;s each
          one, and what it does for you.
        </p>
      </div>

      <div className="border-border grid grid-cols-1 border-t sm:grid-cols-[200px_1fr]">
        {STAGES.map((stage) => (
          <div key={stage.stage} className="contents">
            <div className="border-border border-b py-6 pr-6 sm:pr-6">
              <div className="text-muted-foreground font-mono text-[11px] tracking-wide">{stage.stage}</div>
              <div className="mt-1 text-sm font-medium">{stage.title}</div>
            </div>
            <div className="border-border sm:border-border-l border-b py-6 sm:border-l sm:pl-6">
              <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">{stage.body}</p>
              {stage.intents && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {INTENT_BADGES.map((b) => (
                    <Badge key={b.label} variant="outline" className={b.className}>
                      {b.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
