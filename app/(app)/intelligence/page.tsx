import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/application/auth/current-user";
import { getBudgetStats, getLeadStats, getLeadTrend } from "@/application/leads/lead-queries";
import { getLeadFacets } from "@/application/leads/facets";
import type { FacetDescriptor } from "@/application/leads/facets";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { BreakdownBars, type BreakdownItem } from "@/features/intelligence/components/breakdown-bars";
import { TrendChart } from "@/features/intelligence/components/trend-chart";
import { formatCount } from "@/shared/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Intelligence" };

type SearchParams = Promise<{ datasetId?: string; range?: string }>;

const TREND_RANGES = [7, 30, 90] as const;

const LEAD_TYPE_COLOR: Record<string, string> = {
  Buyer: "bg-intent-buyer",
  Seller: "bg-intent-seller",
  Agent: "bg-intent-agent",
  Broker: "bg-intent-broker",
  Investor: "bg-intent-investor",
  Unknown: "bg-intent-other",
};

/**
 * `bg-brand`, not `bg-chart-1` — `--chart-1` happens to be the exact same hex
 * as `--intent-buyer`, so a magnitude bar (locations, property types, source
 * groups — nobody's "intent") in that hue would look like it's saying "these
 * are buyer counts." Per the design doc's own rule, an intent colour is only
 * ever used for intent; everything else here gets the neutral brand teal.
 */
const MAGNITUDE_COLOR = "bg-brand";

function breakdownFrom(
  facets: FacetDescriptor[],
  key: string,
  limit = 8,
  colorFor?: (label: string) => string | undefined,
): BreakdownItem[] {
  const facet = facets.find((f) => f.key === key);
  if (!facet || facet.kind !== "enum") return [];
  return facet.options
    .slice(0, limit)
    .map((option) => ({ label: option.label, count: option.count, colorClassName: colorFor?.(option.label) ?? MAGNITUDE_COLOR }));
}

function TrendRangeToggle({ datasetId, active }: { datasetId?: string; active: number }) {
  return (
    <div className="flex gap-1.5">
      {TREND_RANGES.map((days) => {
        const params = new URLSearchParams();
        if (datasetId) params.set("datasetId", datasetId);
        if (days !== 30) params.set("range", String(days));
        const query = params.toString();
        return (
          <Link
            key={days}
            href={query ? `/intelligence?${query}` : "/intelligence"}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              days === active
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {days}d
          </Link>
        );
      })}
    </div>
  );
}

export default async function IntelligencePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const { datasetId, range } = await searchParams;
  const trendDays = TREND_RANGES.find((days) => String(days) === range) ?? 30;

  const [stats, trend, budget, facets] = await Promise.all([
    getLeadStats(user.companyId, datasetId),
    getLeadTrend(user.companyId, datasetId, trendDays),
    getBudgetStats(user.companyId, datasetId),
    getLeadFacets(user.companyId, datasetId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Intelligence"
        description="Trends across lead type, location, budget and source. Chart colours are the intent colours — a buyer is blue everywhere, never remapped."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total leads" value={formatCount(stats.total)} />
        <StatTile label="Buyer leads" value={formatCount(stats.buyers)} hint="Of total leads" />
        <StatTile label="Hot buyers" value={formatCount(stats.hotBuyers)} hint="Buyer score ≥ 60" />
        <StatTile label="Contactable" value={formatCount(stats.contactable)} hint="Phone or WhatsApp published" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">New leads, per day</h2>
              <p className="text-muted-foreground text-xs">
                Stacked by buyer vs. other intent — same colour as the inbox badges.
              </p>
            </div>
            <TrendRangeToggle datasetId={datasetId} active={trendDays} />
          </div>
          <TrendChart points={trend} />
        </div>

        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Where demand is</h2>
          <BreakdownBars items={breakdownFrom(facets, "locations")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Lead type</h2>
          <BreakdownBars items={breakdownFrom(facets, "leadType", 8, (label) => LEAD_TYPE_COLOR[label])} />
        </div>

        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Top property types</h2>
          <BreakdownBars items={breakdownFrom(facets, "propertyTypes")} />
        </div>

        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Source groups</h2>
          <BreakdownBars items={breakdownFrom(facets, "groups")} />
        </div>

        {/* Only present once a non-content-post source (e.g. Post Likers) is
            wired up — `getLeadFacets` omits this facet entirely otherwise. */}
        {breakdownFrom(facets, "recordKind").length > 0 && (
          <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
            <h2 className="text-sm font-semibold">Record type</h2>
            <BreakdownBars items={breakdownFrom(facets, "recordKind")} />
          </div>
        )}
      </div>

      <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Budget</h2>
        {budget.withBudget === 0 ? (
          <p className="text-muted-foreground text-sm">No lead has stated a budget yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Stated a budget" value={formatCount(budget.withBudget)} hint="Of total leads" />
            <StatTile
              label="Median (USD)"
              value={budget.medianUsd !== null ? `$${formatCount(budget.medianUsd)}` : "—"}
            />
            <StatTile
              label="Range (USD)"
              value={
                budget.minUsd !== null && budget.maxUsd !== null
                  ? `$${formatCount(budget.minUsd)} – $${formatCount(budget.maxUsd)}`
                  : "—"
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
