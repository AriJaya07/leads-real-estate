import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { PageHeader } from "@/components/common/page-header";
import { ApiKeysManager } from "@/features/api-keys/components/api-keys-manager";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="API keys"
        description="Bearer tokens for the leads API and webhooks. Planned — not yet available; keys created here won't authenticate real requests until the API ships."
      />
      <ApiKeysManager />
    </div>
  );
}
