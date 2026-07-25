import type { Metadata } from "next";
import { requireUser } from "@/application/auth/current-user";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Intelligence" };

export default async function IntelligencePage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Intelligence"
        description="Trends across intent, location, budget and source over time."
      />
      <ComingSoon
        title="Dashboards aren't built yet"
        description="Every lead already carries the signals a dashboard would chart (intent, property type, location, budget) — the aggregation views are next on the roadmap."
      />
    </div>
  );
}
