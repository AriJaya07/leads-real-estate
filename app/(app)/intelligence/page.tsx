import type { Metadata } from "next";
import { requireUser } from "@/application/auth/current-user";
import { getBudgetStats, getLeadStats, getLeadTrend } from "@/application/leads/lead-queries";
import { getLeadFacets } from "@/application/leads/facets";
import type { FacetDescriptor } from "@/application/leads/facets";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { BreakdownBars, type BreakdownItem } from "@/features/intelligence/components/breakdown-bars";
import { TrendChart } from "@/features/intelligence/components/trend-chart";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Intelligence" };

type SearchParams = Promise<{ datasetId?: string }>;

const LEAD_TYPE_COLOR: Record<string, string> = {
  Buyer: "bg-intent-buyer",
  Seller: "bg-intent-seller",
  Agent: "bg-intent-agent",
  Broker: "bg-intent-broker",
  Investor: "bg-intent-investor",
  Unknown: "bg-intent-other",
};

function breakdownFrom(facets: FacetDescriptor[], key: string, limit = 8): BreakdownItem[] {
  const facet = facets.find((f) => f.key === key);
  if (!facet || facet.kind !== "enum") return [];
  return facet.options
    .slice(0, limit)
    .map((option) => ({ label: option.label, count: option.count, colorClassName: LEAD_TYPE_COLOR[option.label] }));
}

export default async function IntelligencePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const { datasetId } = await searchParams;

  const [stats, trend, budget, facets] = await Promise.all([
    getLeadStats(user.companyId, datasetId),
    getLeadTrend(user.companyId, datasetId, 30),
    getBudgetStats(user.companyId, datasetId),
    getLeadFacets(user.companyId, datasetId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Intelligence"
        description="Trends across lead type, location, budget and source, over the last 30 days."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total leads" value={formatCount(stats.total)} />
        <StatTile label="Buyer leads" value={formatCount(stats.buyers)} hint="Of total leads" />
        <StatTile label="Hot buyers" value={formatCount(stats.hotBuyers)} hint="Buyer score ≥ 60" />
        <StatTile label="Contactable" value={formatCount(stats.contactable)} hint="Phone or WhatsApp published" />
      </div>

      <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">New leads, last 30 days</h2>
        <TrendChart points={trend} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Lead type</h2>
          <BreakdownBars items={breakdownFrom(facets, "leadType")} />
        </div>

        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Top locations</h2>
          <BreakdownBars items={breakdownFrom(facets, "locations")} />
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
