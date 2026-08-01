import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export const metadata: Metadata = { title: "Step-by-step guide" };

const STEPS = [
  {
    title: "Connect your first dataset",
    body: "Point DreamRue at your existing Apify actors, with n8n driving the schedule. Once a source is registered, every dataset it produces is auto-discovered — you don't configure feeds one by one.",
  },
  {
    title: "Review the mapping profile",
    body: "New datasets get an auto-generated mapping profile that projects the raw payload onto DreamRue's lead fields, held for admin review unless confidence is high. Our team helps tune mapping for unusual feed shapes — there's no self-serve visual editor yet, so reach out on the contact page if a dataset needs adjustment.",
  },
  {
    title: "Set your alert rules and channels",
    body: "From Admin → Alerts, define what counts as a hot lead (e.g. buyer score above a threshold, in a specific location) and who gets notified, by email or WhatsApp. You'll get one digest per matching rule per sync run, not one message per lead.",
  },
  {
    title: "Work the inbox",
    body: "Leads arrive ranked by priority by default — the most contactable, most-real, most-recently-active buyer at the top. Filter by type, status, location, budget, or any discovered attribute; claim a lead, mark it contacted, and move it through the pipeline as new → contacted → qualified → interested → negotiation → closed (or rejected).",
  },
  {
    title: "Use the kanban and intelligence views",
    body: "The pipeline board lets you drag a lead between statuses without opening it. The intelligence dashboard shows intent, location, property-type, and budget trends over the last 30 days, so you can see patterns beyond your current filter.",
  },
  {
    title: "Invite your team",
    body: "Admins add teammates from Admin → Team with a one-time temporary password — no external email provider required to sign in for the first time. The first person to sign in on a fresh instance becomes the admin.",
  },
] as const;

export default function GuidePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6">
      <div className="text-center">
        <Eyebrow>Step-by-step guide</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">From signup to your first reply</h1>
        <p className="text-muted-foreground mt-3 text-balance">
          What actually happens between signing up and your team working its first ranked inbox. For the concepts
          behind each step, see the{" "}
          <Link href="/docs" className="text-foreground underline underline-offset-4">
            documentation
          </Link>
          .
        </p>
      </div>

      <ol className="relative flex flex-col gap-10">
        <div className="bg-border absolute top-5 bottom-5 left-5 w-px" aria-hidden />
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative flex gap-5">
            <span className="border-brand bg-background text-brand relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-serif text-sm font-semibold italic">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="pt-1.5">
              <h2 className="font-semibold tracking-tight">{step.title}</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
