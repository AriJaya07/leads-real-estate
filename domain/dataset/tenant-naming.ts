/**
 * A shared Apify account serves every company (see
 * docs/multi-tenant-apify-isolation-plan.md §1) — this is the naming
 * convention that lets `application/sync/discovery.ts`'s per-source
 * `namePatterns` filter claim only the datasets a given company actually
 * produced, instead of leaving the filter empty ("track everything").
 * Pure and dependency-free so both the seed script and the app can agree on
 * the exact same prefix shape without importing across module boundaries
 * that don't otherwise talk to each other.
 */
export function tenantDatasetPrefix(companySlug: string): string {
  return `averonai-${companySlug}-`;
}
