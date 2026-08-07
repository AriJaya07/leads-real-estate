import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { hashApiKeySecret } from "@/infrastructure/api-keys/hash";
import type { ApiKeyRow } from "@/infrastructure/db/schema/api-keys";

export interface ApiPrincipal {
  apiKeyId: string;
  companyId: string;
  scope: ApiKeyRow["scope"];
}

/**
 * The bearer-token counterpart to `currentUser()` (`application/auth/current-user.ts`)
 * for `app/api/v1/*` routes. A hash-equality lookup among many stored keys,
 * not `secretsMatch()` (that's for comparing a provided value against one
 * known secret, e.g. the Apify webhook) — an indexed `WHERE key_hash = $1`
 * doesn't have the same timing-leak shape a naive string compare would.
 */
export async function authenticateApiKey(request: Request): Promise<ApiPrincipal | null> {
  const header = request.headers.get("authorization");
  const secret = header?.match(/^Bearer (.+)$/)?.[1];
  if (!secret) return null;

  const [row] = await db()
    .select({
      id: schema.apiKeys.id,
      companyId: schema.apiKeys.companyId,
      scope: schema.apiKeys.scope,
      revokedAt: schema.apiKeys.revokedAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, hashApiKeySecret(secret)))
    .limit(1);

  if (!row || row.revokedAt) return null;

  // Off the request's critical path — a `lastUsedAt` write must never add
  // latency to (or fail) the actual API call it's just bookkeeping for.
  after(() => db().update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.id)));

  return { apiKeyId: row.id, companyId: row.companyId, scope: row.scope };
}
