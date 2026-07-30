import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { getAutomationSettings } from "@/application/automation/automation-settings.queries";
import { PageHeader } from "@/components/common/page-header";
import { AutomationSettingsForm } from "@/features/automation/components/automation-settings-form";

export const metadata: Metadata = { title: "Automation" };

export default async function AdminAutomationPage() {
  const user = await requireAdmin();
  const settings = await getAutomationSettings(user.companyId);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Automation"
        description="Rules that run on a schedule, not a click — lead assignment, follow-up reminders, weekly reports, and outbound sync to your own tools."
      />
      <AutomationSettingsForm settings={settings} />
    </div>
  );
}
