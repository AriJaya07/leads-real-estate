import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getCategoryOverview } from "@/application/platform/category-templates.queries";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { PlatformShell } from "@/components/platform/platform-shell";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Category Templates" };

async function CategoryTemplatesContent() {
  const user = await requirePlatformAdmin();
  const categories = await getCategoryOverview();

  return (
    <PlatformShell active="category-templates" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Category Templates"
          description="Which business verticals tenants actually picked at signup, against how many Apify actor templates are registered for each — see domain/verticals/catalog.ts for the underlying vertical definitions."
        />

        <DataTable minWidth="min-w-[680px]">
          <DataTableHead>
            <th>Category</th>
            <th>Description</th>
            <th className="w-32">Tenants</th>
            <th className="w-44">Actor templates</th>
          </DataTableHead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.category} className="border-border border-t align-top">
                <td className="px-3 py-3 font-medium">{c.label}</td>
                <td className="text-muted-foreground px-3 py-3 text-sm">{c.description}</td>
                <td className="px-3 py-3 font-mono tabular-nums">{formatCount(c.tenantCount)}</td>
                <td className="px-3 py-3 font-mono tabular-nums">
                  {formatCount(c.actorTemplateCount)}
                  {c.tenantCount > 0 && c.actorTemplateCount === 0 && (
                    <span className="text-destructive ml-2 text-xs font-sans font-medium">
                      tenants with no matching actor
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>

        <p className="text-muted-foreground text-sm">
          Actor templates are registered globally at <span className="font-mono text-xs">/admin/collection</span> by
          any tenant admin — tag a template with a category there to have it show up here and get recommended first
          to tenants in that category.
        </p>
      </div>
    </PlatformShell>
  );
}

export default function PlatformCategoryTemplatesPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6"><TableSkeleton /></div>}>
      <CategoryTemplatesContent />
    </Suspense>
  );
}
