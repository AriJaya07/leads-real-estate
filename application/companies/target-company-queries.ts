import "server-only";
import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface TargetCompanyOption {
  id: string;
  name: string;
  domain: string | null;
}

/** Backs the lead detail sheet's "link a company" combobox. */
export async function searchTargetCompanies(
  companyId: string,
  query: string,
): Promise<TargetCompanyOption[]> {
  if (query.trim().length === 0) return [];
  return db()
    .select({
      id: schema.targetCompanies.id,
      name: schema.targetCompanies.name,
      domain: schema.targetCompanies.domain,
    })
    .from(schema.targetCompanies)
    .where(and(eq(schema.targetCompanies.companyId, companyId), ilike(schema.targetCompanies.name, `%${query}%`)))
    .limit(10);
}

export interface LeadAffiliation {
  id: string;
  role: string;
  startedAt: Date | null;
  endedAt: Date | null;
  targetCompany: { id: string; name: string; domain: string | null };
}

export async function getAffiliationsForLead(companyId: string, leadId: string): Promise<LeadAffiliation[]> {
  const rows = await db()
    .select({
      id: schema.leadTargetCompanyAffiliations.id,
      role: schema.leadTargetCompanyAffiliations.role,
      startedAt: schema.leadTargetCompanyAffiliations.startedAt,
      endedAt: schema.leadTargetCompanyAffiliations.endedAt,
      targetCompanyId: schema.targetCompanies.id,
      targetCompanyName: schema.targetCompanies.name,
      targetCompanyDomain: schema.targetCompanies.domain,
    })
    .from(schema.leadTargetCompanyAffiliations)
    .innerJoin(
      schema.targetCompanies,
      eq(schema.targetCompanies.id, schema.leadTargetCompanyAffiliations.targetCompanyId),
    )
    .where(
      and(
        eq(schema.leadTargetCompanyAffiliations.leadId, leadId),
        eq(schema.targetCompanies.companyId, companyId),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    targetCompany: { id: row.targetCompanyId, name: row.targetCompanyName, domain: row.targetCompanyDomain },
  }));
}
