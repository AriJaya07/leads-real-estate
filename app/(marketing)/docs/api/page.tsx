import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { listPlans } from "@/application/billing/plan.actions";
import { DocsNav, DocsToc } from "../docs-toc";

export const metadata: Metadata = { title: "API reference" };

/** Only the plans the public API is actually sold on — excludes the internal, non-sellable "Legacy" catch-all `infrastructure/db/backfill-company.mjs` creates. */
const PUBLIC_PLAN_NAMES = ["Starter", "Professional", "Business", "Enterprise"] as const;

const WEBHOOK_EVENTS = [
  { event: "lead.created_or_updated", description: "A lead's rollup changed — new appearance, re-scored, merged." },
  { event: "lead.status_changed", description: "Pipeline status changed (New → Contacted → Qualified, etc)." },
  { event: "lead.matched", description: "One of your alert rules matched a lead. Fires once per rule per batch, independent of whether the notification itself sends." },
  { event: "alert.fired", description: "An alert notification actually sent (email/WhatsApp/Slack/in-app) for a rule match." },
] as const;

/**
 * Its own component + Suspense boundary, same reason `/pricing`'s `PricingGrid`
 * is split out: `listPlans()` is uncached DB access, and reading it at the top
 * of the page (outside Suspense) would block the whole route from
 * prerendering under Cache Components — see the "blocking-route" Next.js
 * insight. Splitting it here keeps the rest of this static-content page
 * prerenderable while only this table streams in.
 */
async function RateLimitTable() {
  const plans = await listPlans();
  const rateLimits = PUBLIC_PLAN_NAMES.map((name) => plans.find((p) => p.name === name)).filter(
    (p): p is NonNullable<typeof p> => p !== undefined,
  );

  return (
    <div className="border-border mt-4 overflow-hidden rounded-xl border">
      <div className="bg-muted/40 border-border grid grid-cols-3 border-b px-4 py-2.5 text-sm font-medium">
        <span>Plan</span>
        <span>Requests / min</span>
        <span>Burst (10s)</span>
      </div>
      {rateLimits.map((plan) => (
        <div
          key={plan.name}
          className="border-border grid grid-cols-3 border-b px-4 py-2.5 font-mono text-sm last:border-0"
        >
          <span>{plan.name.toLowerCase()}</span>
          <span>{plan.apiRateLimitPerMinute ?? "custom"}</span>
          <span>{plan.apiRateLimitBurst ?? "custom"}</span>
        </div>
      ))}
    </div>
  );
}

function RateLimitTableSkeleton() {
  return <div className="bg-muted/40 mt-4 h-32 animate-pulse rounded-xl" />;
}

export default function DocsApiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex gap-12">
        <DocsNav active="Authentication" />

        <div className="min-w-0 flex-1">
          <h1 id="authentication" className="scroll-mt-24 text-2xl font-semibold tracking-tight sm:text-3xl">
            Authentication
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            Requests are authenticated with a bearer token issued from{" "}
            <Link href="/admin/api-keys" className="text-foreground font-mono text-sm underline underline-offset-4">
              Admin → API keys
            </Link>
            . Keys are scoped, shown once at creation, and revocable at any time.
          </p>

          <pre className="bg-foreground text-background mt-6 overflow-x-auto rounded-xl p-5 font-mono text-[13px] leading-relaxed">
            <code>{`curl "https://api.dreamrue.com/api/v1/leads?leadType=buyer&minBuyerScore=70&pageSize=10" \\
  -H "Authorization: Bearer drk_live_…"`}</code>
          </pre>

          <h2 id="rate-limits" className="mt-10 scroll-mt-24 text-lg font-semibold tracking-tight">
            Rate limits
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Two windows apply per key: a per-minute ceiling and a shorter burst ceiling. Limits come from the same
            plan record that powers billing, so this table can never drift from what&rsquo;s enforced.
          </p>
          <Suspense fallback={<RateLimitTableSkeleton />}>
            <RateLimitTable />
          </Suspense>
          <p className="text-muted-foreground mt-2 text-sm">
            Exceeding either window returns <code className="font-mono text-xs">429</code> with a{" "}
            <code className="font-mono text-xs">Retry-After</code> header.
          </p>

          <h2 id="leads-endpoint" className="mt-10 scroll-mt-24 text-lg font-semibold tracking-tight">
            Leads endpoint
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            <code className="font-mono text-xs">GET /api/v1/leads</code> — read-only, filterable exactly the way the
            inbox is. Responses include the same fields an agent sees in the app: contact info (phone, WhatsApp,
            email), AI-generated summary, and every parsed signal. There is no separate, trimmed public
            representation of a lead — a <code className="font-mono text-xs">leads:read</code> key is scoped to
            &ldquo;this company&rsquo;s data,&rdquo; the same trust level as a signed-in teammate.
          </p>
          <div className="border-border mt-4 overflow-hidden rounded-xl border">
            <div className="bg-muted/40 border-border grid grid-cols-[1fr_2fr] border-b px-4 py-2.5 text-sm font-medium">
              <span>Param</span>
              <span>Meaning</span>
            </div>
            {[
              ["leadType", "Comma-separated: buyer, seller, agent, broker, investor, other"],
              ["status", "Comma-separated pipeline status"],
              ["propertyTypes / locations", "Comma-separated"],
              ["minBuyerScore / minConfidence / minLeadScore", "0–100"],
              ["budgetMin / budgetMax", "USD"],
              ["bookmarked / hasContact", "true / omit"],
              ["sort", "priority (default), newest, oldest, buyerScore, confidence"],
              ["page / pageSize", "pageSize max 100, default 25"],
            ].map(([param, meaning]) => (
              <div
                key={param}
                className="border-border grid grid-cols-[1fr_2fr] border-b px-4 py-2.5 text-sm last:border-0"
              >
                <span className="font-mono text-xs">{param}</span>
                <span className="text-muted-foreground">{meaning}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Response: <code className="font-mono text-xs">{`{ page: { items, total, totalPages, page, pageSize } }`}</code>{" "}
            — identical shape to the app&rsquo;s own lead list.
          </p>

          <h2 id="webhooks" className="mt-10 scroll-mt-24 text-lg font-semibold tracking-tight">
            Webhooks
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            One webhook URL and signing secret per company, configured at{" "}
            <Link href="/admin/automation" className="text-foreground font-mono text-sm underline underline-offset-4">
              Admin → Automation
            </Link>{" "}
            — not a separate per-key subscription system. Every event below fires to that one URL.
          </p>
          <div className="border-border mt-4 overflow-hidden rounded-xl border">
            <div className="bg-muted/40 border-border grid grid-cols-[1fr_2fr] border-b px-4 py-2.5 text-sm font-medium">
              <span>Event</span>
              <span>Fires when</span>
            </div>
            {WEBHOOK_EVENTS.map(({ event, description }) => (
              <div
                key={event}
                className="border-border grid grid-cols-[1fr_2fr] border-b px-4 py-2.5 text-sm last:border-0"
              >
                <span className="font-mono text-xs">{event}</span>
                <span className="text-muted-foreground">{description}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Every request carries an <code className="font-mono text-xs">X-DreamRue-Signature</code> header — hex
            HMAC-SHA256 of the raw JSON body, signed with your webhook secret. Verify it before trusting the payload.
            Body shape: <code className="font-mono text-xs">{`{ event, companyId, timestamp, data }`}</code>.
            Delivery is single-attempt and best-effort — a slow or failing endpoint never blocks lead processing —
            with every attempt visible on the{" "}
            <Link href="/admin/api-keys" className="text-foreground font-mono text-sm underline underline-offset-4">
              API keys
            </Link>{" "}
            page&rsquo;s recent-deliveries list, where you can retry a failed one by hand.
          </p>

          <h2 id="security-practices" className="mt-10 scroll-mt-24 text-lg font-semibold tracking-tight">
            Security practices
          </h2>
          <ul className="text-muted-foreground mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
            <li>Keys are shown once, at creation. We store a hash, never the plaintext — if you lose a key, revoke it and create a new one.</li>
            <li>Revoking a key takes effect immediately; there is no grace period.</li>
            <li>Webhook payloads are HMAC-signed; always verify the signature before acting on a payload.</li>
            <li>Every key is scoped to the company that created it — there is no cross-company access, ever.</li>
            <li>
              Honest gaps: there is no key rotation flow beyond revoke-and-recreate, and no IP allowlisting yet.
              Both are on the roadmap, not in the box.
            </li>
          </ul>
        </div>

        <DocsToc
          entries={[
            { id: "authentication", label: "Authentication" },
            { id: "rate-limits", label: "Rate limits" },
            { id: "leads-endpoint", label: "Leads endpoint" },
            { id: "webhooks", label: "Webhooks" },
            { id: "security-practices", label: "Security practices" },
          ]}
        />
      </div>
    </div>
  );
}
