import type { Metadata } from "next";
import { Eyebrow } from "@/components/marketing/eyebrow";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>About</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Built inside an agency, not a lab</h1>
        <p className="text-muted-foreground mt-4 text-balance">
          DreamRue started as the internal tool one Bali agency used to stop losing leads to whoever refreshed
          Facebook first. It&rsquo;s now sold to the agencies it used to compete with.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-2">
          <div className="border-border rounded-xl border p-5">
            <div className="font-serif text-2xl font-semibold">2023</div>
            <div className="text-muted-foreground mt-1 text-sm">first internal build</div>
          </div>
          <div className="border-border rounded-xl border p-5">
            <div className="font-serif text-2xl font-semibold">Bali</div>
            <div className="text-muted-foreground mt-1 text-sm">one market, done properly</div>
          </div>
        </div>

        <p className="text-muted-foreground mt-10 text-sm leading-relaxed">
          Staying focused on one market and one problem — being first to reply to a real buyer — is a deliberate
          choice, not a limitation waiting to be fixed. Every decision in the product, from the intent taxonomy to
          the plan limits, is built around Bali real estate specifically rather than a generic lead-gen use case.
        </p>
      </div>
    </div>
  );
}
