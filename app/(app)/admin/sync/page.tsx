import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Sync activity" };

export default async function AdminSyncPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Sync activity"
        description="Every sync run across every dataset, with per-stage logs."
      />
      <ComingSoon
        title="A cross-dataset activity log isn't built yet"
        description="Per-dataset health and item counts are already on the dataset registry. A unified run history and log viewer across every dataset is next on the roadmap — in the meantime, per-dataset sync status is visible from Datasets."
      />
    </div>
  );
}
