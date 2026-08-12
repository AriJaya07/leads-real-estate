import { Suspense } from "react";
import type { Metadata } from "next";
import { requireManager } from "@/application/auth/current-user";
import { roleAtLeast } from "@/domain/auth/permissions";
import { listActorTemplates } from "@/application/collection/actor-templates.queries";
import { listScrapeRequests, getCollectionOverview } from "@/application/collection/scrape-requests.queries";
import { getUsageSummary } from "@/application/billing/usage";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { RequestScrapeForm } from "@/features/collection/components/request-scrape-form";
import { ScrapeRequestTable } from "@/features/collection/components/scrape-request-table";
import { ActorTemplateManager } from "@/features/collection/components/actor-template-manager";
import { formatCount } from "@/shared/format";
import type { CompanyCategory } from "@/domain/verticals/catalog";

export const metadata: Metadata = { title: "Collect data" };

async function Overview({ companyId }: { companyId: string }) {
  const overview = await getCollectionOverview(companyId);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatTile label="Requests (30d)" value={overview.requests30d} />
      <StatTile label="Succeeded" value={overview.succeeded30d} />
      <StatTile
        label="Failed"
        value={overview.failed30d}
        emphasis={overview.failed30d > 0}
      />
      <StatTile label="Items collected (30d)" value={formatCount(overview.itemsCollected30d)} />
      <StatTile
        label="Est. cost (30d)"
        value={`$${overview.estimatedCostUsd30d.toFixed(2)}`}
        hint={`${overview.apifyRequestsThisMonth.used}/${overview.apifyRequestsThisMonth.limit} Apify requests this month`}
      />
    </div>
  );
}

async function RequestSection({ companyId, category }: { companyId: string; category: CompanyCategory }) {
  const [templates, usage] = await Promise.all([listActorTemplates(), getUsageSummary(companyId)]);
  // Category-matching templates (and category-agnostic ones) first — never
  // hidden, just prioritized, same "don't hide data, prioritize it" posture
  // as lead ranking elsewhere in this app.
  const sorted = [...templates.filter((t) => t.enabled)].sort((a, b) => {
    const aMatch = a.category === null || a.category === category ? 0 : 1;
    const bMatch = b.category === null || b.category === category ? 0 : 1;
    return aMatch - bMatch;
  });
  return (
    <RequestScrapeForm
      templates={sorted}
      companyCategory={category}
      quota={usage?.apifyRequestsThisMonth ?? null}
    />
  );
}

async function HistorySection({ companyId }: { companyId: string }) {
  const requests = await listScrapeRequests(companyId);
  return <ScrapeRequestTable requests={requests} />;
}

async function AdminSection() {
  const templates = await listActorTemplates();
  return <ActorTemplateManager templates={templates} />;
}

export default async function AdminCollectionPage() {
  const user = await requireManager();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Collect data"
        description="Pick a source and what you need, and the system picks the right Apify actor, runs it, validates the results and stores them — same pipeline every other dataset goes through."
      />

      <Suspense fallback={<StatRowSkeleton />}>
        <Overview companyId={user.companyId} />
      </Suspense>

      <section className="border-border flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Request a scrape</h2>
        <Suspense fallback={<TableSkeleton />}>
          <RequestSection companyId={user.companyId} category={user.companyCategory} />
        </Suspense>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">History</h2>
        <Suspense fallback={<TableSkeleton />}>
          <HistorySection companyId={user.companyId} />
        </Suspense>
      </section>

      {roleAtLeast(user.role, "admin") && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Actor templates</h2>
          <Suspense fallback={<TableSkeleton />}>
            <AdminSection />
          </Suspense>
        </section>
      )}
    </div>
  );
}
