import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Roadmap" };

const SHIPPED = [
  "Person-centric lead identity — deterministic dedup across Facebook, Instagram, posts, comments, and likes",
  "Rules-based buyer/seller/agent/investor/broker scoring with per-lead score reasons",
  "Priority-ranked inbox with filtering on any discovered attribute",
  "Pipeline kanban board (new → contacted → qualified → interested → negotiation → closed)",
  "Intelligence dashboard — 30-day intent, location, property-type, and budget trends",
  "Configurable alert rules with a predicate language, digest batching, and email delivery",
  "Automatic dataset discovery and sync-health monitoring, including schema-drift detection",
] as const;

const NEXT_UP = [
  {
    title: "Buyer-side data sourcing",
    body: "The highest-leverage gap: today's feeds are almost entirely seller listings and job posts. Expanding into buyer-side Facebook groups, keyword searches, and mining commenters on listing posts is next.",
  },
  {
    title: "Visual mapping editor",
    body: "Mapping profiles — the rules that project a raw feed onto a lead — are still reviewed as JSON. A visual editor is planned so this doesn't require engineering help.",
  },
  {
    title: "LLM-assisted classification",
    body: "A shadow LLM classifier already runs alongside the rules-based one for comparison logging. It doesn't yet determine any score you see — that requires evaluating shadow results against real lead volume first.",
  },
  {
    title: "WhatsApp activation",
    body: "The WhatsApp notifier is built and gated to paid plans; turning it on for a workspace just needs that workspace's WhatsApp Cloud API credentials connected.",
  },
  {
    title: "Semantic / embeddings search",
    body: "Planned once the underlying vector database infrastructure is in place.",
  },
] as const;

export default function RoadmapPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Roadmap</h1>
        <p className="text-muted-foreground mt-3 text-balance">
          What&rsquo;s shipped, and what&rsquo;s next, in the order we&rsquo;re prioritizing it. Questions about
          timing?{" "}
          <Link href="/contact" className="text-foreground underline underline-offset-4">
            Get in touch
          </Link>
          .
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Shipped</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {SHIPPED.map((item) => (
            <li key={item} className="text-muted-foreground flex gap-3 text-sm">
              <span className="text-brand" aria-hidden>
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Next up</h2>
        <ol className="mt-4 flex flex-col gap-6">
          {NEXT_UP.map((item, index) => (
            <li key={item.title} className="flex gap-4">
              <span className="text-muted-foreground shrink-0 text-sm font-semibold tabular-nums">
                {index + 1}
              </span>
              <div>
                <h3 className="font-medium">{item.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
