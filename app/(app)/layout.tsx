import { Suspense } from "react";
import { requireUser } from "@/application/auth/current-user";
import { AppSidebar } from "@/features/shell/components/app-sidebar";
import { AppTopbar } from "@/features/shell/components/app-topbar";
import { listDatasets } from "@/application/datasets/dataset-queries";

async function DatasetSwitcherSlot() {
  const datasets = await listDatasets();
  return (
    <AppTopbar
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
 */
async function AuthedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="bg-background flex min-h-dvh">
      <AppSidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="border-border h-14 border-b" />}>
          <DatasetSwitcherSlot />
        </Suspense>
        <main className="min-w-0 flex-1">{children}</main>
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
