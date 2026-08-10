import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Segment {
  slug: string;
  navLabel: string;
  eyebrow: string;
  heading: string;
  description: string;
  cards: { title: string; body: string }[];
  quote: string;
  quoteContext: React.ReactNode;
}

const SEGMENTS: Segment[] = [
  {
    slug: "villa-property-agencies",
    navLabel: "Villa & property agencies",
    eyebrow: "For villa & property agencies",
    heading: "Your four agents can't read every group. This can.",
    description:
      "Rental and sales enquiries land in the same twenty Bali groups every day. AveronAi reads them all, types each poster, and routes the ones worth your time to the agent who covers that area.",
    cards: [
      { title: "Route by area", body: "Canggu leads to the Canggu agent, automatically." },
      { title: "Filter out the trade", body: "Agents and brokers are typed and hidden by default." },
      { title: "One timer per lead", body: "Time-to-first-touch, per agent, per week." },
      { title: "No double-messaging", body: "Assignment is visible before anyone opens WhatsApp." },
    ],
    quote: "Need a 3BR villa Berawa for 12 months, moving in October, budget 40jt/month.",
    quoteContext: (
      <>
        A real shape of post from a Bali rentals group. Typed <strong className="text-intent-buyer font-medium">Buyer</strong>,
        budget parsed, area matched, in your inbox before the fifth comment.
      </>
    ),
  },
  {
    slug: "property-developers",
    navLabel: "Property developers",
    eyebrow: "For property developers",
    heading: "Know who's asking about your project before the sales office does.",
    description:
      "Buyer chatter about a launch happens in public groups long before anyone fills out a contact form. AveronAi surfaces posts naming your project, area or price point, scored the same way as every other lead.",
    cards: [
      { title: "Project-level filtering", body: "Filter by the property type and location your launch actually covers." },
      { title: "Budget already parsed", body: "See stated budget ranges without opening a single post." },
      { title: "Investor vs. buyer, separated", body: "Investor-intent posts are typed apart from owner-occupier demand." },
      { title: "One board for the sales team", body: "Every enquiry moves through the same pipeline your agents already use." },
    ],
    quote: "Anyone got info on the new project near Pererenan? Looking for 2BR, off-plan pricing.",
    quoteContext: (
      <>
        Typed <strong className="text-intent-buyer font-medium">Buyer</strong>, off-plan intent flagged, location
        matched to Pererenan — routed the same way any other buyer lead is.
      </>
    ),
  },
  {
    slug: "independent-brokers",
    navLabel: "Independent brokers",
    eyebrow: "For independent brokers",
    heading: "One person can't watch fifteen groups all day. A schedule can.",
    description:
      "Working solo means every minute spent scrolling is a minute not spent closing. AveronAi runs on a schedule you set and hands you a ranked list instead of a raw feed.",
    cards: [
      { title: "Set it and check twice a day", body: "Sync cadence is yours — no need to watch groups live." },
      { title: "Score, not scroll", body: "Every post is scored on stated intent, budget clarity and recency." },
      { title: "Contactable first", body: "Filter to only leads that published a phone or WhatsApp." },
      { title: "Notes stay with the lead", body: "Status, notes and tags — enough to hand off cleanly if you ever grow a team." },
    ],
    quote: "Looking for land, freehold, 5-10 are, Tabanan or Bali north coast, cash buyer.",
    quoteContext: (
      <>
        Typed <strong className="text-intent-buyer font-medium">Buyer</strong>, land size and location parsed
        into structured fields — no manual copy-paste into a spreadsheet.
      </>
    ),
  },
  {
    slug: "investment-consultants",
    navLabel: "Investment consultants",
    eyebrow: "For investment consultants",
    heading: "Separate the investor conversation from the villa-hunting one.",
    description:
      "Yield and lease-term questions get buried in groups dominated by rental enquiries. AveronAi types investor-intent posts apart from buyer/renter chatter, so the conversations you actually want don't get lost.",
    cards: [
      { title: "Investor intent, typed", body: "Yield, lease-term and ROI questions are classified separately from buyer posts." },
      { title: "Location trends over 30 days", body: "See where investor interest is clustering, not just today's posts." },
      { title: "Confidence scored", body: "A single ambiguous comment doesn't outrank a clear, corroborated post." },
      { title: "No engagement bias", body: "Likes and comments are shown as context — they never move a lead up the list." },
    ],
    quote: "Anyone know of land plots near Ubud with a 25-year lease?",
    quoteContext: (
      <>
        Typed <strong className="text-intent-investor font-medium">Investor</strong>, lease-term signal captured,
        surfaced separately from the buyer/renter posts in the same group.
      </>
    ),
  },
];

export function generateStaticParams() {
  return SEGMENTS.map((s) => ({ segment: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segment: string }>;
}): Promise<Metadata> {
  const { segment } = await params;
  const found = SEGMENTS.find((s) => s.slug === segment);
  return { title: found ? found.navLabel : "Solutions" };
}

export default async function SolutionPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = await params;
  const current = SEGMENTS.find((s) => s.slug === segment);
  if (!current) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Segments" className="mb-10 flex flex-wrap gap-2">
        {SEGMENTS.map((s) => (
          <Link
            key={s.slug}
            href={`/solutions/${s.slug}`}
            className={cn(
              "rounded-lg border px-3.5 py-1.5 text-sm transition-colors",
              s.slug === current.slug
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.navLabel}
          </Link>
        ))}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <p className="text-brand font-mono text-xs tracking-wide uppercase">{current.eyebrow}</p>
          <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {current.heading}
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-balance">{current.description}</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {current.cards.map((card) => (
              <div key={card.title} className="border-border rounded-xl border p-4">
                <p className="text-sm font-medium">{card.title}</p>
                <p className="text-muted-foreground mt-1 text-sm">{card.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-border border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-9">
          <p className="font-serif text-lg italic">&ldquo;{current.quote}&rdquo;</p>
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{current.quoteContext}</p>
          <Button render={<Link href="/signup" />} variant="outline" className="mt-6 w-full">
            Start free trial
          </Button>
        </div>
      </div>
    </div>
  );
}
