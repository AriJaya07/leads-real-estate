import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getCategoryDetail, listLexiconPhrases, listCategoryActions } from "@/application/categories/categories.queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/common/relative-time";
import { PlatformShell } from "@/components/platform/platform-shell";
import { CategoryConfigForm } from "@/features/platform/components/category-config-form";
import { LexiconPhraseEditor } from "@/features/platform/components/lexicon-phrase-editor";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Category config" };

const ACTION_LABEL: Record<string, string> = {
  create_category: "Created category",
  update_config: "Updated config",
  update_lexicon: "Updated lexicon",
};

async function CategoryDetailContent({ params }: { params: Promise<{ category: string }> }) {
  const user = await requirePlatformAdmin();
  const { category: slug } = await params;

  const detail = await getCategoryDetail(slug);
  if (!detail) notFound();

  const [phrases, actionLog] = await Promise.all([
    listLexiconPhrases(detail.id),
    listCategoryActions(detail.id),
  ]);

  return (
    <PlatformShell active="categories" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title={detail.label}
          description={detail.description}
          actions={
            <Link href="/platform/categories" className="text-sm font-medium underline underline-offset-2">
              ← All categories
            </Link>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Tenants" value={formatCount(detail.tenantCount)} />
          <StatTile
            label="Actor templates"
            value={formatCount(detail.actorTemplateCount)}
            tone={detail.tenantCount > 0 && detail.actorTemplateCount === 0 ? "warn" : undefined}
            hint={
              detail.tenantCount > 0 && detail.actorTemplateCount === 0
                ? "tenants with no matching actor"
                : undefined
            }
          />
        </div>

        <CategoryConfigForm detail={detail} />

        <LexiconPhraseEditor categoryId={detail.id} phrases={phrases} />

        <div className="border-border rounded-xl border">
          <div className="border-border border-b px-4 py-3 text-sm font-semibold">Change log</div>
          {actionLog.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">No Super Admin has edited this category yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {actionLog.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Badge variant="outline">{ACTION_LABEL[entry.action] ?? entry.action}</Badge>
                  <span className="text-muted-foreground">{entry.platformAdminName ?? entry.platformAdminEmail}</span>
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

export default function PlatformCategoryDetailPage({ params }: { params: Promise<{ category: string }> }) {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6"><StatRowSkeleton /></div>}>
      <CategoryDetailContent params={params} />
    </Suspense>
  );
}
