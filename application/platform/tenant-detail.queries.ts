import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { currentMonthBounds } from "@/application/billing/usage";

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  categoryLabel: string;
  status: string;
  trialEndsAt: Date | null;
  createdAt: Date;
  planName: string | null;
  seatCount: number;
  apifyRequestsThisMonth: number;
  leadsThisMonth: number;
  datasetCount: number;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface SuperAdminActionLogRow {
  id: string;
  action: string;
  details: Record<string, unknown>;
  platformAdminName: string | null;
  platformAdminEmail: string;
  createdAt: Date;
}

/**
 * Everything the tenant drill-in page (`/platform/tenants/[companyId]`)
 * shows — deliberately company/usage/invite *metadata* only, never a
 * `leads`/`lead_appearances` row. See `tenants.queries.ts`'s comment for why
 * that boundary matters; this is the same rule applied to a single-tenant
 * view instead of the cross-tenant list.
 */
export async function getTenantDetail(companyId: string): Promise<TenantDetail | null> {
  const { start } = currentMonthBounds();

  const [company] = await db()
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      slug: schema.companies.slug,
      categoryLabel: schema.categories.label,
      status: schema.companies.status,
      trialEndsAt: schema.companies.trialEndsAt,
      createdAt: schema.companies.createdAt,
    })
    .from(schema.companies)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.companies.categoryId))
    .where(eq(schema.companies.id, companyId))
    .limit(1);
  if (!company) return null;

  const [[subscription], [{ apifyRequestsThisMonth }], [{ leadsThisMonth }], [{ datasetCount }], seats] =
    await Promise.all([
      db()
        .select({ planName: schema.plans.name, seats: schema.subscriptions.seats })
        .from(schema.subscriptions)
        .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
        .where(eq(schema.subscriptions.companyId, companyId))
        .limit(1),
      db()
        .select({ apifyRequestsThisMonth: schema.usageCounters.value })
        .from(schema.usageCounters)
        .where(
          and(
            eq(schema.usageCounters.companyId, companyId),
            eq(schema.usageCounters.metric, "apify_requests_month"),
            eq(schema.usageCounters.periodStart, start),
          ),
        )
        .limit(1)
        .then((rows) => (rows.length ? rows : [{ apifyRequestsThisMonth: 0 }])),
      db()
        .select({ leadsThisMonth: schema.usageCounters.value })
        .from(schema.usageCounters)
        .where(
          and(
            eq(schema.usageCounters.companyId, companyId),
            eq(schema.usageCounters.metric, "leads_this_month"),
            eq(schema.usageCounters.periodStart, start),
          ),
        )
        .limit(1)
        .then((rows) => (rows.length ? rows : [{ leadsThisMonth: 0 }])),
      db()
        .select({ datasetCount: schema.datasets.id })
        .from(schema.datasets)
        .where(eq(schema.datasets.companyId, companyId))
        .then((rows) => [{ datasetCount: rows.length }]),
      db()
        .select({ count: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.companyId, companyId)),
    ]);

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    categoryLabel: company.categoryLabel,
    status: company.status,
    trialEndsAt: company.trialEndsAt,
    createdAt: company.createdAt,
    planName: subscription?.planName ?? null,
    seatCount: seats.length,
    apifyRequestsThisMonth,
    leadsThisMonth,
    datasetCount,
  };
}

export async function listPendingInvites(companyId: string): Promise<PendingInvite[]> {
  return db()
    .select({
      id: schema.invites.id,
      email: schema.invites.email,
      role: schema.invites.role,
      expiresAt: schema.invites.expiresAt,
      createdAt: schema.invites.createdAt,
    })
    .from(schema.invites)
    .where(and(eq(schema.invites.companyId, companyId), isNull(schema.invites.acceptedAt), isNull(schema.invites.revokedAt)))
    .orderBy(desc(schema.invites.createdAt));
}

/** Recent Super Admin writes against this tenant — the audit trail a tenant owner could be shown if they asked. */
export async function listSuperAdminActionsForCompany(companyId: string): Promise<SuperAdminActionLogRow[]> {
  const rows = await db()
    .select({
      id: schema.superAdminActions.id,
      action: schema.superAdminActions.action,
      details: schema.superAdminActions.details,
      platformAdminName: schema.users.name,
      platformAdminEmail: schema.users.email,
      createdAt: schema.superAdminActions.createdAt,
    })
    .from(schema.superAdminActions)
    .innerJoin(schema.users, eq(schema.users.id, schema.superAdminActions.platformAdminUserId))
    .where(eq(schema.superAdminActions.companyId, companyId))
    .orderBy(desc(schema.superAdminActions.createdAt))
    .limit(20);
  return rows;
}
