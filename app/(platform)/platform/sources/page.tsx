import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getSourceRegistryOverview, getSourceUsageByTemplate } from "@/application/platform/sources.queries";
import { listAllCategoriesBasic } from "@/application/categories/categories.queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { PlatformShell } from "@/components/platform/platform-shell";
import { SourceRegistryManager } from "@/features/platform/components/source-registry-manager";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Source Registry" };

async function SourcesContent() {
  const user = await requirePlatformAdmin();
  const [overview, usageByTemplate, categories] = await Promise.all([
    getSourceRegistryOverview(),
    getSourceUsageByTemplate(),
    listAllCategoriesBasic(),
  ]);

  const enabledCount = overview.templates.filter((t) => t.enabled).length;
  const configuredPlatforms = overview.byPlatform.filter((p) => p.total > 0).length;
  const totalRequests = Array.from(usageByTemplate.values()).reduce((sum, n) => sum + n, 0);

  return (
    <PlatformShell active="sources" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Source Registry"
          description="Every data source (Facebook, Instagram, LinkedIn, Google Maps, TikTok, ...) available across every tenant — enable/disable a source or register a new one here, platform-wide."
        />

        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile label="Sources registered" value={formatCount(overview.templates.length)} />
          <StatTile label="Enabled" value={formatCount(enabledCount)} />
          <StatTile label="Platforms configured" value={`${configuredPlatforms}/${overview.byPlatform.length}`} />
          <StatTile label="Requests, all time" value={formatCount(totalRequests)} />
        </div>

        <SourceRegistryManager
          templates={overview.templates}
          categories={categories}
          byPlatform={overview.byPlatform}
          usageByTemplate={usageByTemplate}
        />
      </div>
    </PlatformShell>
  );
}

export default function PlatformSourcesPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6"><StatRowSkeleton /></div>}>
      <SourcesContent />
    </Suspense>
  );
}
