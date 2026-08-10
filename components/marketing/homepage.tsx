import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Reveal } from "@/components/marketing/reveal";
import { HeroInboxMockup } from "@/components/marketing/mockups/hero-inbox-mockup";
import { listPlans } from "@/application/billing/plan.actions";
import { formatUsd } from "@/shared/format";
import { cn } from "@/lib/utils";

/**
 * Real customer quotes don't exist yet — this codebase's own posture (see
 * `docs/final-recommendations.md`, `pricing-strategy.md`) is to never fill a
 * gap like this with fabricated testimonials. The UX plan agrees: its own
 * mockup of this section carries a "HOLD FOR LAUNCH — needs real quotes"
 * flag rather than instructing it to ship. The section is built (markup,
 * layout, the `font-serif italic` quote treatment already used in the hero)
 * but held off until real quotes exist — flip this on then.
 */
const SHOW_TESTIMONIALS = false;

/** Placeholder — deliberately labelled as such so a flipped flag can't ship as real quotes by accident. */
const TESTIMONIALS = [
  { quote: "We stopped scrolling groups at 11pm. The inbox does it.", name: "Agency name", role: "Head of sales · placeholder" },
  { quote: "First reply in under ten minutes changed our close rate.", name: "Agency name", role: "Owner · placeholder" },
  { quote: "Four agents, one list, no more arguing over who saw it first.", name: "Agency name", role: "Broker · placeholder" },
] as const;

export const FAQS = [
  {
    q: "Do you support LinkedIn?",
    a: "Not yet. Facebook and Instagram are live; the connector layer is built so LinkedIn can be added without a new product. It's on the roadmap, not in the box.",
  },
  {
    q: "Is this a CRM?",
    a: "No — and we're not becoming one. You get status, notes and tags so a lead never gets lost between here and the CRM you already pay for.",
  },
  {
    q: "What happens to my data if I downgrade?",
    a: "Nothing is deleted. Access degrades — collection pauses, seats lock — the leads stay yours and come back the moment you upgrade.",
  },
  {
    q: "Will it merge two people who look similar?",
    a: "Never on a guess. Identity resolution only joins profiles on confirmed signals — you'll never be asked “is this the same person?”",
  },
  {
    q: "How fast is “fast”?",
    a: "Sync cadence is yours to set. Every lead carries a live timer from the moment we see it to the moment someone on your team replies.",
  },
  {
    q: "Is there an API?",
    a: "Yes — a read-only leads API and outbound webhooks, both bearer-token authenticated. See the API reference for the full contract.",
  },
] as const;

const PIPELINE_STEPS = [
  {
    index: "01",
    title: "We watch the groups your buyers post in",
    description: "Facebook and Instagram sources you choose, collected on a schedule you control.",
  },
  {
    index: "02",
    title: "Intent, budget and location get read out",
    description:
      "Each post is classified — buyer, seller, agent, broker, investor — with the phrases that justified it.",
  },
  {
    index: "03",
    title: "Your agent gets there first",
    description:
      "Ranked inbox, alerts to WhatsApp or email, and a timer on every lead until someone replies.",
  },
] as const;

const BENEFITS = [
  {
    title: "One lead, not ten duplicates",
    description:
      "The same person posting in four groups is one profile. Merges are confirmed, never guessed — we won't show you a \"maybe\".",
  },
  {
    title: "Never miss a hot buyer",
    description: "Alert rules on intent, budget, location or score. Digest or instant, to email or WhatsApp.",
  },
  {
    title: "Scores you can argue with",
    description: "Every priority score shows its reasons. Likes and comments are context, never a ranking signal.",
  },
  {
    title: "Your team, with the right keys",
    description:
      "Owner, admin, manager, member — spend decisions stay with the owner, triage stays with agents.",
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
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="border-border bg-surface-alt text-brand inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
              <span className="bg-brand size-1.5 rounded-full" aria-hidden />
              Live on Facebook &amp; Instagram · Bali
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Whoever replies first
              <br />
              wins the deal.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-xl text-lg text-balance">
              AveronAi finds people announcing they&apos;re looking for property in Bali — and puts them in front of
              your agents before your competitors have finished scrolling.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button render={<Link href="/signup" />} size="lg">
                Start 14-day trial
                <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button render={<Link href="#how-it-works" />} variant="outline" size="lg">
                See how it works
              </Button>
            </div>
            <div className="border-border mt-8 flex items-center gap-6 border-t pt-6">
              <div>
                <p className="text-brand text-2xl font-semibold tracking-tight">14 min</p>
                <p className="text-muted-foreground mt-0.5 text-xs">median time to first touch</p>
              </div>
              <div className="bg-border h-8 w-px" aria-hidden />
              <div>
                <p className="text-2xl font-semibold tracking-tight">6.2×</p>
                <p className="text-muted-foreground mt-0.5 text-xs">faster than manual scanning</p>
              </div>
            </div>
          </div>

          <HeroInboxMockup />
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Eyebrow>How it works</Eyebrow>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {PIPELINE_STEPS.map((step) => (
            <Reveal key={step.index}>
              <span className="text-brand font-mono text-xs">{step.index}</span>
              <h3 className="mt-3 text-base font-medium">{step.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{step.description}</p>
            </Reveal>
          ))}
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <Reveal key={benefit.title} className="border-border bg-card rounded-2xl border p-6">
              <h3 className="text-base font-medium">{benefit.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{benefit.description}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="border-border bg-surface-alt mt-4 flex flex-col items-start gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-medium">Sync health, in the open</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              When a source changes shape, you see schema drift before your lead flow quietly dries up.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <span className="rounded-md bg-[var(--health-ok-bg)] px-2.5 py-1 text-xs font-medium text-[var(--health-ok-fg)]">
              Healthy 12
            </span>
            <span className="rounded-md bg-[var(--health-drift-bg)] px-2.5 py-1 text-xs font-medium text-[var(--health-drift-fg)]">
              Drift 1
            </span>
          </div>
        </Reveal>
      </section>

      {SHOW_TESTIMONIALS && (
        <section className="border-border bg-surface-alt border-t">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="text-center">
              <Eyebrow>What agencies say</Eyebrow>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <div key={t.name} className="border-border bg-card rounded-2xl border p-6">
                  <p className="font-serif text-lg italic">&ldquo;{t.quote}&rdquo;</p>
                  <p className="mt-4 text-sm font-medium">{t.name}</p>
                  <p className="text-muted-foreground text-xs">{t.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-border mx-auto max-w-6xl border-t px-4 py-16 sm:px-6">
        <div className="flex items-baseline justify-between gap-4">
          <Eyebrow>Plans</Eyebrow>
          <Link href="/pricing" className="text-foreground text-sm underline underline-offset-4">
            See the full comparison →
          </Link>
        </div>
        <Suspense fallback={<p className="text-muted-foreground mt-10 text-center text-sm">Loading plans…</p>}>
          <PricingTeaser />
        </Suspense>
      </section>

      <section className="border-border bg-surface-alt border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-16 text-center sm:flex-row sm:text-left sm:px-6">
          <div>
            <h2 className="text-lg font-medium">Facebook and Instagram today. Your CRM next.</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Sources are pluggable — new connectors appear here, not in a new product.
            </p>
          </div>
          <Button render={<Link href="/integrations" />} variant="outline" className="shrink-0">
            See integrations
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <Eyebrow>Questions we actually get</Eyebrow>
        </div>
        <div className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {FAQS.map((faq) => (
            <div key={faq.q} className="border-border border-b pb-6">
              <h3 className="text-base font-medium">{faq.q}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border bg-foreground text-background border-t">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Fourteen days. No card.</h2>
          <p className="max-w-md text-balance opacity-75">
            Connect one source and see what your team has been missing this week.
          </p>
          <Button render={<Link href="/signup" />} size="lg" variant="secondary">
            Start free trial
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </section>
    </>
  );
}

async function PricingTeaser() {
  const plans = await listPlans();
  const mainPlans = plans.length > 3 ? plans.slice(0, 3) : plans;
  const customPlan = plans.length > 3 ? plans[plans.length - 1] : null;
  const recommendedIndex = 2;

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {mainPlans.map((plan, index) => (
        <div
          key={plan.id}
          className={cn(
            "border-border bg-card relative flex flex-col gap-3 rounded-2xl border p-5",
            index === recommendedIndex && "border-brand shadow-[0_14px_34px_-22px_var(--brand)]",
          )}
        >
          {index === recommendedIndex && (
            <span className="bg-brand absolute -top-2.5 left-5 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium text-white">
              Most agencies
            </span>
          )}
          <span className="text-sm font-medium">{plan.name}</span>
          <span className="font-serif text-2xl font-semibold">
            {plan.monthlyPriceUsd === null ? "Contact us" : formatUsd(plan.monthlyPriceUsd)}
            {plan.monthlyPriceUsd !== null && <span className="text-muted-foreground text-xs font-normal">/mo</span>}
          </span>
          <span className="text-muted-foreground text-xs">
            {plan.maxSeats ?? "Unlimited"} seats · {plan.maxDatasets ?? "Unlimited"} datasets ·{" "}
            {plan.maxAlertRules ?? "unlimited"} alert rules
          </span>
        </div>
      ))}
      {customPlan && (
        <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border border-dashed p-5">
          <span className="text-sm font-medium">{customPlan.name}</span>
          <span className="font-serif text-2xl font-semibold">Contact us</span>
          <span className="text-muted-foreground text-xs">Custom seats, sources and SLAs</span>
        </div>
      )}
    </div>
  );
}
