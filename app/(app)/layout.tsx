import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/application/auth/current-user";
import { AppSidebar } from "@/features/shell/components/app-sidebar";
import { AppTopbar } from "@/features/shell/components/app-topbar";
import { listDatasets } from "@/application/datasets/dataset-queries";

async function DatasetSwitcherSlot({
  userEmail,
  role,
}: {
  userEmail: string;
  role: "admin" | "agent";
}) {
  const datasets = await listDatasets();
  return (
    <AppTopbar
      userEmail={userEmail}
      role={role}
      datasets={datasets.map((d) => ({
        id: d.id,
        label: d.label,
        leadCount: d.leadCount,
        health: d.health,
      }))}
    />
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

  return (
    <div className="bg-background flex min-h-dvh">
      <AppSidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="border-border h-14 border-b" />}>
          <DatasetSwitcherSlot userEmail={user.email} role={user.role} />
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
