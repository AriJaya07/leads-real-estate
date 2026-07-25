import { NextResponse } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { listDatasets } from "@/application/datasets/dataset-queries";

/**
 * Backs the topbar's dataset-switcher query (`features/datasets/queries.ts`).
 * Every signed-in user sees the switcher (not admin-only), so this checks
 * only that someone is signed in — same as `/api/leads`.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasets = await listDatasets();
  return NextResponse.json({ datasets });
}
