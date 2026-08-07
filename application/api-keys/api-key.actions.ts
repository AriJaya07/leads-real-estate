"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient } from "@/application/safe-action";
import { apiKeysTag } from "@/application/cache-tags";
import { displayPrefix, generateApiKeySecret, hashApiKeySecret } from "@/infrastructure/api-keys/hash";

/**
 * `leads:read` is hardcoded, not a form field: `leads:write` exists on the
 * `scope` enum for a future write endpoint, but offering it in the create
 * form today would promise a capability nothing implements. Remove this
 * hardcoding the day a write endpoint ships.
 */
export const createApiKey = adminActionClient
  .inputSchema(z.object({ name: z.string().trim().min(1).max(100) }))
  .action(async ({ parsedInput, ctx }) => {
    const secret = generateApiKeySecret();

    const [row] = await db()
      .insert(schema.apiKeys)
      .values({
        companyId: ctx.user.companyId,
        name: parsedInput.name,
        keyHash: hashApiKeySecret(secret),
        keyPrefix: displayPrefix(secret),
        scope: "leads:read",
        createdBy: ctx.user.userId,
      })
      .returning({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        keyPrefix: schema.apiKeys.keyPrefix,
        scope: schema.apiKeys.scope,
        createdAt: schema.apiKeys.createdAt,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        revokedAt: schema.apiKeys.revokedAt,
      });

    updateTag(apiKeysTag(ctx.user.companyId));
    // `secret` is returned exactly once — nothing server-side keeps the plaintext past this call.
    return { key: row, secret };
  });

export const revokeApiKey = adminActionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await db()
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiKeys.id, parsedInput.id), eq(schema.apiKeys.companyId, ctx.user.companyId)));

    updateTag(apiKeysTag(ctx.user.companyId));
    return { ok: true };
  });
