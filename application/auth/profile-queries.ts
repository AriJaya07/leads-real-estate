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
