"use server";

import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { authActionClient } from "@/application/safe-action";

/**
 * Upsert, not the `lead_states` create-once-never-overwrite pattern — profile
 * fields are the account owner's own settings, meant to be freely editable,
 * not human-authored-once pipeline output.
 */
export const updateProfile = authActionClient
  .inputSchema(
    z.object({
      phone: z.string().trim().max(40).optional(),
      timezone: z.string().trim().min(1).max(60).optional(),
      jobTitle: z.string().trim().max(120).optional(),
      bio: z.string().trim().max(2000).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await db()
      .insert(schema.profiles)
      .values({
        userId: ctx.user.userId,
        phone: parsedInput.phone || null,
        timezone: parsedInput.timezone || "Asia/Makassar",
        jobTitle: parsedInput.jobTitle || null,
        bio: parsedInput.bio || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.profiles.userId,
        set: {
          phone: parsedInput.phone || null,
          timezone: parsedInput.timezone || "Asia/Makassar",
          jobTitle: parsedInput.jobTitle || null,
          bio: parsedInput.bio || null,
          updatedAt: new Date(),
        },
      });

    return { ok: true };
  });
