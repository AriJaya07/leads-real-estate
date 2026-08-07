import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { ApiKeyRow } from "@/infrastructure/db/schema/api-keys";

/** Backs `/admin/api-keys` — company-scoped, most recent first. Never selects `keyHash`: the admin UI has no reason to see it, and a full-row select would put a secret-derived value in an RSC payload for no benefit. */
export async function listApiKeys(companyId: string): Promise<Omit<ApiKeyRow, "keyHash">[]> {
  return db()
    .select({
      id: schema.apiKeys.id,
      companyId: schema.apiKeys.companyId,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      scope: schema.apiKeys.scope,
      createdBy: schema.apiKeys.createdBy,
      createdAt: schema.apiKeys.createdAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      revokedAt: schema.apiKeys.revokedAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.companyId, companyId))
    .orderBy(desc(schema.apiKeys.createdAt));
}
