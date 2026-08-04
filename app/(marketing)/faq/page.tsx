import type { Metadata } from "next";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { FAQS } from "@/components/marketing/homepage";

export const metadata: Metadata = { title: "FAQ" };

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
