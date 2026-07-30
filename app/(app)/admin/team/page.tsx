import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/application/auth/current-user";
import { listAssignableTeamMembers, listTeamMembers } from "@/application/auth/team.actions";
import { listPendingInvites } from "@/application/auth/invite.actions";
import { listTeams } from "@/application/teams/team-queries";
import { getUsageSummary } from "@/application/billing/usage";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { TeamTable } from "@/features/team/components/team-table";
import { TeamsPanel } from "@/features/teams/components/teams-panel";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import type { Role } from "@/domain/auth/permissions";

export const metadata: Metadata = { title: "Team" };

async function Usage({ companyId }: { companyId: string }) {
  const usage = await getUsageSummary(companyId);
  if (!usage) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile label="Seats" value={`${usage.seats.used} / ${usage.seats.limit}`} />
      <StatTile label="Datasets" value={`${usage.datasets.used} / ${usage.datasets.limit}`} />
      <StatTile
        label="Leads this month"
        value={`${usage.leadsThisMonth.used} / ${usage.leadsThisMonth.limit}`}
      />
    </div>
  );
}

async function Team({
  currentUserId,
  companyId,
  viewerRole,
}: {
  currentUserId: string;
  companyId: string;
  viewerRole: Role;
}) {
  const [members, pendingInvites] = await Promise.all([
    listTeamMembers(companyId),
    listPendingInvites(companyId),
  ]);
  return (
    <TeamTable
      members={members}
      pendingInvites={pendingInvites}
      currentUserId={currentUserId}
      viewerRole={viewerRole}
    />
  );
}

async function Teams({ companyId }: { companyId: string }) {
  const [teams, members] = await Promise.all([listTeams(companyId), listAssignableTeamMembers(companyId)]);
  return <TeamsPanel teams={teams} members={members} />;
}

export default async function AdminTeamPage() {
  const user = await requireAdmin();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Team"
        description="Invite teammates by email. Without a mail provider configured, the invite link is shown on screen to copy and send yourself."
      />

      <Suspense fallback={<StatRowSkeleton />}>
        <Usage companyId={user.companyId} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={4} />}>
        <Team currentUserId={user.userId} companyId={user.companyId} viewerRole={user.role} />
      </Suspense>

      <div>
        <h2 className="mb-3 text-sm font-medium">Teams</h2>
        <Suspense fallback={<TableSkeleton rows={2} />}>
          <Teams companyId={user.companyId} />
        </Suspense>
      </div>
    </div>
  );
}
