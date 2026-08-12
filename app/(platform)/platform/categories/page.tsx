import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getCategoryOverview } from "@/application/categories/categories.queries";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { PlatformShell } from "@/components/platform/platform-shell";
import { NewCategoryForm } from "@/features/platform/components/new-category-form";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Categories" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  beta: "secondary",
  disabled: "outline",
};

async function CategoriesContent() {
  const user = await requirePlatformAdmin();
  const categories = await getCategoryOverview();

  return (
    <PlatformShell active="categories" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Categories"
          description="Business verticals tenants pick at signup — adoption vs. registered Apify actor templates, and each category's visibility/filter/lexicon config. Creating one here is instant — no code or migration."
        />

        <DataTable minWidth="min-w-[760px]">
          <DataTableHead>
            <th>Category</th>
            <th>Description</th>
            <th className="w-28">Status</th>
            <th className="w-32">Tenants</th>
            <th className="w-44">Actor templates</th>
          </DataTableHead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-border border-t align-top">
                <td className="px-3 py-3">
                  <Link href={`/platform/categories/${c.slug}`} className="font-medium hover:underline">
                    {c.label}
                  </Link>
                </td>
                <td className="text-muted-foreground px-3 py-3 text-sm">{c.description}</td>
                <td className="px-3 py-3">
                  <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                  {c.status === "disabled" && c.tenantCount > 0 && (
                    <div className="text-[var(--health-warn-fg)] mt-1 text-xs font-medium">
                      {c.tenantCount} tenant{c.tenantCount === 1 ? "" : "s"} still on it
                    </div>
                  )}
                </td>
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

        <NewCategoryForm />

        <p className="text-muted-foreground text-sm">
          Actor templates are registered globally at <span className="font-mono text-xs">/admin/collection</span> by
          any tenant admin — tag a template with a category there to have it show up here and get recommended first
          to tenants in that category.
        </p>
      </div>
    </PlatformShell>
  );
}

export default function PlatformCategoriesPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6"><TableSkeleton /></div>}>
      <CategoriesContent />
    </Suspense>
  );
}
