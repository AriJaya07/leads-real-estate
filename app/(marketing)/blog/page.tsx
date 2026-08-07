import type { Metadata } from "next";
import { Eyebrow } from "@/components/marketing/eyebrow";

export const metadata: Metadata = { title: "Blog" };

const LEAD_POST = {
  tag: "MARKET NOTES · 6 MIN",
  title: "What 4,000 Bali property posts say about the September season",
  description:
    "Where enquiries clustered, which budgets moved, and how long the average buyer waited for a reply.",
};

const POSTS = [
  { tag: "PRODUCT · 4 MIN", title: "Why we won't guess that two profiles are the same person" },
  { tag: "PRODUCT · 5 MIN", title: "Time-to-first-touch: the only sales metric we optimise" },
] as const;

/**
 * Index only — no `[slug]` detail route yet. Lowest-priority marketing page
 * in the plan (no product dependency), and there's no evidence yet that a
 * reader wants an interactive post beyond this teaser list.
 */
export default function BlogPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Eyebrow>Blog</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">From the field</h1>

        <div className="border-border bg-card mt-10 overflow-hidden rounded-2xl border">
          <div className="bg-surface-alt flex h-48 items-center justify-center">
            <span className="text-muted-foreground text-xs">Lead article image · 1200×630</span>
          </div>
          <div className="p-6">
            <p className="text-brand font-mono text-xs tracking-wide">{LEAD_POST.tag}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{LEAD_POST.title}</h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm">{LEAD_POST.description}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {POSTS.map((post) => (
            <div key={post.title} className="border-border rounded-xl border p-5">
              <p className="text-muted-foreground font-mono text-xs tracking-wide">{post.tag}</p>
              <h3 className="mt-2 text-base font-medium">{post.title}</h3>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
