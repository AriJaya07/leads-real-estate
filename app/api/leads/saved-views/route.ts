import { NextResponse } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { listSavedViews } from "@/application/leads/saved-views.queries";

/** Backs the client-side saved-searches refetch (after create/delete) — see app/api/leads/route.ts's comment. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const views = await listSavedViews(user.companyId, user.userId);
  return NextResponse.json({ views });
}
