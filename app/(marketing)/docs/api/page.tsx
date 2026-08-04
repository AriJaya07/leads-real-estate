import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "API reference" };

const SIDEBAR = [
  { heading: "Getting started", items: ["Overview", "Quickstart", "User guide"] },
  {
    heading: "API",
    items: ["Authentication", "Rate limits", "Leads endpoint", "Webhooks", "Security practices"],
    active: "Authentication",
  },
] as const;

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

      <div className="grid gap-10 lg:grid-cols-[200px_1fr_190px]">
        <nav aria-label="Docs" className="hidden lg:block">
          {SIDEBAR.map((group) => (
            <div key={group.heading} className="mb-6">
              <div className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
                {group.heading}
              </div>
              <div className="flex flex-col gap-1 text-sm">
                {group.items.map((item) => (
                  <span
                    key={item}
                    className={"active" in group && group.active === item ? "text-brand font-medium" : "text-muted-foreground"}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Authentication</h1>
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

          <h2 className="mt-10 text-lg font-semibold tracking-tight">Rate limits</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Illustrative for now — final limits will be tied to the same per-plan record that powers billing, so
            this table won&rsquo;t need to be updated by hand once the API ships.
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

        <nav aria-label="On this page" className="hidden lg:block">
          <div className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
            On this page
          </div>
          <div className="border-border flex flex-col gap-2 border-l-2 pl-3 text-sm">
            <span className="text-brand">Authentication</span>
            <span className="text-muted-foreground">Rate limits</span>
            <span className="text-muted-foreground">Errors</span>
            <span className="text-muted-foreground">Webhook signatures</span>
          </div>
        </nav>
      </div>
    </div>
  );
}
