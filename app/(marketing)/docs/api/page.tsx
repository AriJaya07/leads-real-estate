import type { Metadata } from "next";
import Link from "next/link";
import { DocsNav, DocsToc } from "../docs-toc";

export const metadata: Metadata = { title: "API reference" };

const RATE_LIMITS = [
  { plan: "professional", perMinute: "60", burst: "120" },
  { plan: "business", perMinute: "180", burst: "360" },
  { plan: "enterprise", perMinute: "custom", burst: "custom" },
] as const;

export default function DocsApiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-[var(--health-warn-bg)] px-3 py-1 text-xs font-medium text-[var(--health-warn-fg)]">
        Planned — not yet available. Keys unlock when the API ships.
      </div>

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
            <code>{`curl https://api.dreamrue.com/v1/leads \\
  -H "Authorization: Bearer drk_live_…" \\
  -G --data-urlencode "intent=buyer&min_score=70"`}</code>
          </pre>

          <h2 id="rate-limits" className="mt-10 scroll-mt-24 text-lg font-semibold tracking-tight">
            Rate limits
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Limits come from the same plan record that powers billing, so this table can never drift from
            what&rsquo;s enforced.
          </p>
          <div className="border-border mt-4 overflow-hidden rounded-xl border">
            <div className="bg-muted/40 border-border grid grid-cols-3 border-b px-4 py-2.5 text-sm font-medium">
              <span>Plan</span>
              <span>Requests / min</span>
              <span>Burst</span>
            </div>
            {RATE_LIMITS.map((row) => (
              <div
                key={row.plan}
                className="border-border grid grid-cols-3 border-b px-4 py-2.5 font-mono text-sm last:border-0"
              >
                <span>{row.plan}</span>
                <span>{row.perMinute}</span>
                <span>{row.burst}</span>
              </div>
            ))}
          </div>

          <h2 className="mt-10 text-lg font-semibold tracking-tight">What ships with v1</h2>
          <ul className="text-muted-foreground mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
            <li>A read-only leads endpoint, filterable the same way the inbox is.</li>
            <li>Outbound webhooks for new-lead-matched and alert-fired events, with signed payloads.</li>
            <li>Key rotation, scoped permissions, and per-key revocation.</li>
          </ul>
        </div>

        <DocsToc
          entries={[
            { id: "authentication", label: "Authentication" },
            { id: "rate-limits", label: "Rate limits" },
          ]}
        />
      </div>
    </div>
  );
}
