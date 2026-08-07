import type { Metadata } from "next";
import { ContactForm } from "@/features/marketing/components/contact-form";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto flex max-w-md flex-col gap-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Contact us</h1>
          <p className="text-muted-foreground mt-3 text-balance">
            Questions about pricing, onboarding, or connecting your datasets — tell us a bit about your agency and
            we&rsquo;ll get back to you.
          </p>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}
