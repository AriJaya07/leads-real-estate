import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { getLeadStats } from "@/application/leads/lead-queries";

/** Backs the client-side stats query — see app/api/leads/route.ts's comment. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = request.nextUrl.searchParams.get("datasetId") ?? undefined;
  const stats = await getLeadStats(datasetId);
  return NextResponse.json({ stats });
}
