import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { currentUser } from "@/application/auth/current-user";
import { AppSidebar } from "@/features/shell/components/app-sidebar";
import { AppTopbar } from "@/features/shell/components/app-topbar";
import { listDatasets, getSyncOverview } from "@/application/datasets/dataset-queries";
import { getLeadStats } from "@/application/leads/lead-queries";
import { listTeamMembers } from "@/application/auth/team.actions";
import { datasetsQueryKey } from "@/features/datasets/query-keys";
import { getQueryClient } from "@/shared/query-client";
import type { Role } from "@/domain/auth/permissions";
import type { NavExtras } from "@/features/shell/nav-items";

/** Signed-in app screens stay out of search results; only the marketing site is public. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Everything `NavContent` needs beyond the static route list — live, so it's
 * fetched once per request here (all three calls are already `"use cache"`-backed
 * server functions used elsewhere) and handed down to both nav surfaces
 * (desktop `AppSidebar`, mobile drawer via `AppTopbar` → `MobileNav`) instead of
 * each fetching its own copy or a client waterfall running below the fold.
 */
async function getNavExtras(companyId: string): Promise<NavExtras> {
  const [stats, syncOverview, members] = await Promise.all([
    getLeadStats(companyId),
    getSyncOverview(companyId),
    listTeamMembers(companyId),
  ]);

  const syncTone: NavExtras["syncTone"] =
    syncOverview.datasets === 0
      ? null
      : syncOverview.needsAttention > 0
        ? "bad"
        : syncOverview.stale > 0
          ? "warn"
          : "ok";

  return {
    inboxCount: stats.newStatusCount,
    syncTone,
    hasSource: syncOverview.datasets > 0,
    hasTeammates: members.length > 1,
  };
}

async function DatasetSwitcherSlot({
  userEmail,
  role,
  companyId,
  navExtras,
}: {
  userEmail: string;
  role: Role;
  companyId: string;
  navExtras: NavExtras;
}) {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: datasetsQueryKey,
    queryFn: () => listDatasets(companyId),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AppTopbar userEmail={userEmail} role={role} navExtras={navExtras} />
    </HydrationBoundary>
  );
}

/**
 * The shell reads the session, which is per-request data. Under Cache
 * Components that has to sit inside a Suspense boundary, otherwise it blocks
 * the whole route from prerendering and every page waits on the auth check.
 *
 * Deliberately `currentUser()` here, not `requireUser()` — this layout also
 * wraps `/account`, and `requireUser()` redirects to `/account` whenever
 * `mustChangePassword` is set, which would loop forever on that exact route.
 * The chrome itself isn't sensitive; the real per-page gate (`requireUser()`/
 * `requireAdmin()`) still runs in every page's own Server Component, which is
 * what actually enforces the redirect (see the comment on `requireUser()` for
 * why that has to live at the page, not here).
 */
async function AuthedShell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const navExtras = await getNavExtras(user.companyId);

  return (
    <div className="bg-background flex min-h-dvh">
      <AppSidebar role={user.role} navExtras={navExtras} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="border-border h-14 border-b" />}>
          <DatasetSwitcherSlot
            userEmail={user.email}
            role={user.role}
            companyId={user.companyId}
            navExtras={navExtras}
          />
        </Suspense>
        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="bg-background flex min-h-dvh">
      <div className="bg-sidebar border-sidebar-border hidden w-56 shrink-0 border-r md:block" />
      <div className="flex-1">
        <div className="border-border h-14 border-b" />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
