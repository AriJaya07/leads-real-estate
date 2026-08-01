import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Documentation" };

const CONCEPTS = [
  {
    title: "Leads are people, not posts",
    body: "The same Facebook or Instagram account posting in multiple groups — or showing up as both a post author and someone who liked a listing — is merged into one lead, with every source it was found in listed underneath. Matching is deterministic: it only merges on an exact Facebook ID, Instagram ID, or profile URL, never on similar-looking names or photos. A wrong merge is worse than a duplicate, so DreamRue never guesses.",
  },
  {
    title: "Scoring and ranking",
    body: "Every post is classified as buyer, seller, agent, or other intent, with the specific phrase or budget mention that drove the score attached as the reason. At the person level, those appearances roll up into a buyer/seller/investor/broker score and a confidence score — a second and third corroborating post matters far more than a tenth. The inbox defaults to the highest-priority, most-recently-active buyer at the top.",
  },
  {
    title: "Alert rules",
    body: "Admins define who gets notified about which kind of lead, on which channel (email or WhatsApp), using a simple rule made of comparisons like \"buyer score above 70\" or \"location is Canggu.\" Thresholds are edited from the admin UI, not a deploy. The whole sales team gets one digest per matching rule per sync run, not one email per lead.",
  },
  {
    title: "Sync health and schema drift",
    body: "New datasets from your connected Apify actors or n8n feeds show up automatically — nobody configures a new feed by hand. If an upstream source changes its field names, that dataset is flagged as schema drift instead of silently producing bad data, and a human reviews the mapping before it's trusted again.",
  },
  {
    title: "Roles: agent vs. admin",
    body: "An agent works the inbox — filters and searches leads, claims and contacts them, logs notes, and moves them through the pipeline. An admin can do everything an agent can, plus manage team accounts, review dataset mapping profiles, monitor sync health, and tune alert rules and thresholds.",
  },
] as const;

export default function DocsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Documentation</h1>
        <p className="text-muted-foreground mt-3 text-balance">
          How DreamRue turns raw social posts into a ranked, workable lead inbox. For the onboarding walkthrough,
          see the{" "}
          <Link href="/docs/guide" className="text-foreground underline underline-offset-4">
            step-by-step guide
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {CONCEPTS.map((concept) => (
          <div key={concept.title} className="border-border border-b pb-8 last:border-0 last:pb-0">
            <h2 className="text-lg font-semibold tracking-tight">{concept.title}</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{concept.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
