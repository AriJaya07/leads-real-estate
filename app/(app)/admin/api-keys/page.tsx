import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { getAutomationSettings } from "@/application/automation/automation-settings.queries";
import { listRecentWebhookDeliveries } from "@/application/automation/webhook-deliveries.queries";
import { PageHeader } from "@/components/common/page-header";
import { ApiKeysManager } from "@/features/api-keys/components/api-keys-manager";
import { WebhookDeliveriesCard } from "@/features/automation/components/webhook-deliveries-card";

export const metadata: Metadata = { title: "API keys" };

async function Webhooks({ companyId }: { companyId: string }) {
  const [settings, deliveries] = await Promise.all([
    getAutomationSettings(companyId),
    listRecentWebhookDeliveries(companyId),
  ]);

  return <WebhookDeliveriesCard webhookUrl={settings.webhookEnabled ? settings.webhookUrl : null} deliveries={deliveries} />;
}

export default async function ApiKeysPage() {
  const user = await requireAdmin();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="API keys"
        description="Bearer tokens for the leads API and webhooks. Planned — not yet available; keys created here won't authenticate real requests until the API ships."
      />
      <ApiKeysManager />

      <Suspense fallback={null}>
        <Webhooks companyId={user.companyId} />
      </Suspense>
    </div>
  );
}
