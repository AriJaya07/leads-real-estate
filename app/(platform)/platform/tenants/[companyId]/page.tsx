import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import {
  getTenantDetail,
  listPendingInvites,
  listSuperAdminActionsForCompany,
} from "@/application/platform/tenant-detail.queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/common/relative-time";
import { PlatformShell } from "@/components/platform/platform-shell";
import { ExtendTrialButton, ResendInviteButton } from "@/features/platform/components/tenant-drill-in-actions";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Tenant detail" };

const ACTION_LABEL: Record<string, string> = {
  extend_trial: "Extended trial",
  resend_invite: "Resent invite",
};

async function TenantDetailContent({ params }: { params: Promise<{ companyId: string }> }) {
  const user = await requirePlatformAdmin();
  const { companyId } = await params;
  const [tenant, invites, actionLog] = await Promise.all([
    getTenantDetail(companyId),
    listPendingInvites(companyId),
    listSuperAdminActionsForCompany(companyId),
  ]);
  if (!tenant) notFound();

  return (
    <PlatformShell active="tenants" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {/* Unmissable framing on purpose — see docs/multi-tenant-apify-isolation-plan.md §3:
            this is the one screen that could otherwise be confused with the tenant's own view. */}
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 dark:border-amber-900 dark:bg-amber-950">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Viewing {tenant.name} as Super Admin — read only
          </span>
          <span className="flex-1" />
          <Link href="/platform/tenants" className="text-sm font-medium text-amber-800 underline dark:text-amber-200">
            Exit to platform
          </Link>
        </div>

        <PageHeader
          title={tenant.name}
          description={`${tenant.slug} · ${tenant.categoryLabel} · ${tenant.planName ?? "no subscription"} · created ${new Date(tenant.createdAt).toLocaleDateString()}`}
          actions={<ExtendTrialButton companyId={tenant.id} canExtend={tenant.status === "trialing"} />}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Seats" value={formatCount(tenant.seatCount)} />
          <StatTile label="Leads this month" value={formatCount(tenant.leadsThisMonth)} />
          <StatTile label="Datasets" value={formatCount(tenant.datasetCount)} />
        </div>

        <div className="border-border rounded-xl border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Pending invites</span>
          </div>
          {invites.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">No pending invites.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{invite.email}</div>
                    <div className="text-muted-foreground text-xs">
                      {invite.role} · expires <RelativeTime value={invite.expiresAt} />
                    </div>
                  </div>
                  <ResendInviteButton invite={invite} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-border rounded-xl border">
          <div className="border-border border-b px-4 py-3 text-sm font-semibold">
            Super Admin action log for this tenant
          </div>
          {actionLog.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              No Super Admin has ever written to this tenant — the whole point.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {actionLog.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Badge variant="outline">{ACTION_LABEL[entry.action] ?? entry.action}</Badge>
                  <span className="text-muted-foreground">
                    {entry.platformAdminName ?? entry.platformAdminEmail}
                  </span>
                  <span className="flex-1" />
                  <RelativeTime value={entry.createdAt} className="text-muted-foreground text-xs" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PlatformShell>
  );
}

export default function PlatformTenantDetailPage({ params }: { params: Promise<{ companyId: string }> }) {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6"><StatRowSkeleton /></div>}>
      <TenantDetailContent params={params} />
    </Suspense>
  );
}
