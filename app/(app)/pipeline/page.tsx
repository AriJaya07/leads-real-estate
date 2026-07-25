import type { Metadata } from "next";
import { requireUser } from "@/application/auth/current-user";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Pipeline"
        description="A kanban view of every lead's status, from new to converted."
      />
      <ComingSoon
        title="Pipeline board isn't built yet"
        description="Lead status already exists (new → contacted → qualified → viewing booked → converted) — the inbox filters on it today. A drag-and-drop board view is next on the roadmap."
      />
    </div>
  );
}
