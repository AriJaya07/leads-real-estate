import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface Profile {
  phone: string | null;
  timezone: string;
  locale: string;
  jobTitle: string | null;
  bio: string | null;
}

const DEFAULTS: Profile = { phone: null, timezone: "Asia/Makassar", locale: "en", jobTitle: null, bio: null };

/** No row exists until the account owner edits their profile for the first time — defaults fill the gap. */
export async function getProfile(userId: string): Promise<Profile> {
  const [row] = await db()
    .select({
      phone: schema.profiles.phone,
      timezone: schema.profiles.timezone,
      locale: schema.profiles.locale,
      jobTitle: schema.profiles.jobTitle,
      bio: schema.profiles.bio,
    })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  return row ?? DEFAULTS;
}

/** `users.acceptsAssignments` — whether this teammate is currently in the auto-assignment round-robin pool. */
export async function getAcceptsAssignments(userId: string): Promise<boolean> {
  const [row] = await db()
    .select({ acceptsAssignments: schema.users.acceptsAssignments })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.acceptsAssignments ?? true;
}
