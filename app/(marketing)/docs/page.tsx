import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { ScoredPostIcon } from "@/components/marketing/diagram-icons";
import { DocsNav, DocsToc } from "./docs-toc";

export const metadata: Metadata = { title: "Documentation" };

const CONCEPTS = [
  {
    id: "leads-are-people",
    title: "Leads are people, not posts",
    body: "The same Facebook or Instagram account posting in multiple groups — or showing up as both a post author and someone who liked a listing — is merged into one lead, with every source it was found in listed underneath. Matching is deterministic: it only merges on an exact Facebook ID, Instagram ID, or profile URL, never on similar-looking names or photos. A wrong merge is worse than a duplicate, so DreamRue never guesses.",
  },
  {
    id: "scoring-and-ranking",
    title: "Scoring and ranking",
    body: "Every post is classified as buyer, seller, agent, or other intent, with the specific phrase or budget mention that drove the score attached as the reason. At the person level, those appearances roll up into a buyer/seller/investor/broker score and a confidence score — a second and third corroborating post matters far more than a tenth. The inbox defaults to the highest-priority, most-recently-active buyer at the top.",
  },
  {
    id: "alert-rules",
    title: "Alert rules",
    body: "Admins define who gets notified about which kind of lead, on which channel (email or WhatsApp), using a simple rule made of comparisons like \"buyer score above 70\" or \"location is Canggu.\" Thresholds are edited from the admin UI, not a deploy. The whole sales team gets one digest per matching rule per sync run, not one email per lead.",
  },
  {
    id: "sync-health",
    title: "Sync health and schema drift",
    body: "New datasets from your connected Apify actors or n8n feeds show up automatically — nobody configures a new feed by hand. If an upstream source changes its field names, that dataset is flagged as schema drift instead of silently producing bad data, and a human reviews the mapping before it's trusted again.",
  },
  {
    id: "roles",
    title: "Roles: agent vs. admin",
    body: "An agent works the inbox — filters and searches leads, claims and contacts them, logs notes, and moves them through the pipeline. An admin can do everything an agent can, plus manage team accounts, review dataset mapping profiles, monitor sync health, and tune alert rules and thresholds.",
  },
] as const;

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <div className="mb-12">
        <Eyebrow>Documentation</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">How DreamRue works</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-balance">
          How DreamRue turns raw social posts into a ranked, workable lead inbox. For the onboarding walkthrough,
          see the{" "}
          <Link href="/docs/guide" className="text-foreground underline underline-offset-4">
            step-by-step guide
          </Link>
          .
        </p>
      </div>

      <div className="flex gap-12">
        <DocsNav active="Overview" />

        <div className="flex min-w-0 flex-1 flex-col gap-10">
          {CONCEPTS.map((concept) => (
            <div key={concept.id} id={concept.id} className="border-border scroll-mt-24 border-b pb-10 last:border-0 last:pb-0">
              <div className="flex items-start gap-3">
                {concept.id === "scoring-and-ranking" && (
                  <ScoredPostIcon className="text-brand mt-0.5 shrink-0" />
                )}
                <h2 className="text-lg font-semibold tracking-tight">{concept.title}</h2>
              </div>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{concept.body}</p>
            </div>
          ))}
        </div>

        <DocsToc entries={CONCEPTS.map(({ id, title }) => ({ id, label: title }))} />
      </div>
    </div>
  );
}
