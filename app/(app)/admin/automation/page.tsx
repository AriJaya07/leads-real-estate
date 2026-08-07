import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { getAutomationSettings } from "@/application/automation/automation-settings.queries";
import { listAutomationRules } from "@/application/automation/automation-rules.queries";
import { listAssignableTeamMembers } from "@/application/auth/team.actions";
import { PageHeader } from "@/components/common/page-header";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { AutomationSettingsForm } from "@/features/automation/components/automation-settings-form";
import { AutomationRulesManager } from "@/features/automation/components/automation-rules-manager";

export const metadata: Metadata = { title: "Automation" };

async function RoutingRules({ companyId }: { companyId: string }) {
  const [rules, teamMembers] = await Promise.all([listAutomationRules(companyId), listAssignableTeamMembers(companyId)]);
  return <AutomationRulesManager rules={rules} teamMembers={teamMembers} />;
}

export default async function AdminAutomationPage() {
  const user = await requireAdmin();
  const settings = await getAutomationSettings(user.companyId);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Automation"
        description="Rules that run on a schedule, not a click — lead assignment, follow-up reminders, weekly reports, and outbound sync to your own tools."
      />
      <Suspense fallback={<TableSkeleton />}>
        <RoutingRules companyId={user.companyId} />
      </Suspense>
      <AutomationSettingsForm settings={settings} />
    </div>
  );
}
