import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { getAlertRuleFireCounts, listAlertRules } from "@/application/alerting/alert-rules.queries";
import { getLeadFacets } from "@/application/leads/facets";
import { PageHeader } from "@/components/common/page-header";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { AlertRuleManager } from "@/features/alerting/components/alert-rule-manager";

export const metadata: Metadata = { title: "Alerts" };

async function AlertRules({ companyId }: { companyId: string }) {
  const [rules, facets, fireCounts] = await Promise.all([
    listAlertRules(companyId),
    getLeadFacets(companyId),
    getAlertRuleFireCounts(companyId),
  ]);

  const optionsFor = (key: string) => {
    const facet = facets.find((f) => f.key === key);
    return facet && facet.kind === "enum" ? facet.options.map((o) => ({ value: o.value, label: o.label })) : [];
  };

  return (
    <AlertRuleManager
      rules={rules}
      propertyTypeOptions={optionsFor("propertyTypes")}
      locationOptions={optionsFor("locations")}
      fireCounts={fireCounts}
    />
  );
}

export default async function AdminAlertsPage() {
  const user = await requireAdmin();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Alerts"
        description="Define who gets notified about which kind of lead, on which channel — retune thresholds any time, no deploy needed."
      />

      <Suspense fallback={<TableSkeleton />}>
        <AlertRules companyId={user.companyId} />
      </Suspense>
    </div>
  );
}
