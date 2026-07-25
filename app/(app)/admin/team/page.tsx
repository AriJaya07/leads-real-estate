import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { listTeamMembers } from "@/application/auth/team.actions";
import { PageHeader } from "@/components/common/page-header";
import { TeamTable } from "@/features/team/components/team-table";
import { SkeletonGrid } from "@/components/common/skeleton-grid";

export const metadata: Metadata = { title: "Team" };

async function Team({ currentUserId }: { currentUserId: string }) {
  const members = await listTeamMembers();
  return <TeamTable members={members} currentUserId={currentUserId} />;
}

export default async function AdminTeamPage() {
  const user = await requireAdmin();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Team"
        description="Create accounts and hand over the generated password directly. No email provider is involved, so nothing depends on a mail service being configured."
      />
      <Suspense fallback={<SkeletonGrid />}>
        <Team currentUserId={user.userId} />
      </Suspense>
    </div>
  );
}
