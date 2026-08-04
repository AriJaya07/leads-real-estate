import type { Metadata } from "next";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { FAQS as HOMEPAGE_FAQS } from "@/components/marketing/homepage";

export const metadata: Metadata = { title: "FAQ" };

/**
 * The dedicated FAQ page leads with the four questions the design doc calls
 * out verbatim (LinkedIn, CRM, downgrade, billing), then folds in the rest of
 * the site's real FAQ answers from the homepage teaser rather than
 * duplicating or inventing new ones.
 */
const FAQS = [
  HOMEPAGE_FAQS[0], // "Do you support LinkedIn?"
  {
    q: "Is this a CRM?",
    a: "No. You get status, notes and tags on a lead — enough to hand it over cleanly, deliberately short of deal values and invoicing.",
  },
  {
    q: "What happens if I downgrade?",
    a: "Nothing is deleted. Access degrades — collection pauses, seats lock — the leads stay yours and come back the moment you upgrade.",
  },
  {
    q: "Who can see billing?",
    a: "Only the account owner. Billing and subscription details are scoped to whoever holds the account — admins run the team and sources, but payment stays with the owner.",
  },
  ...HOMEPAGE_FAQS.slice(3),
] as const;

/** Native `<details>` — no JS needed for a disclosure list, and it comes with keyboard/focus behavior for free. */
export default function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Eyebrow>FAQ</Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Questions we actually get</h1>

      <div className="mt-8 flex flex-col">
        {FAQS.map((faq) => (
          <details key={faq.q} className="border-border group border-b py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-medium">
              {faq.q}
              <span className="text-muted-foreground text-lg group-open:hidden">+</span>
              <span className="text-muted-foreground hidden text-lg group-open:inline">−</span>
            </summary>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{faq.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
