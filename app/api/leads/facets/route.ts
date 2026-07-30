import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { getDynamicAttributeFacets, getLeadFacets } from "@/application/leads/facets";

/** Backs the client-side facets query — see app/api/leads/route.ts's comment. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = request.nextUrl.searchParams.get("datasetId") ?? undefined;
  const [facets, dynamicFacets] = await Promise.all([
    getLeadFacets(user.companyId, datasetId),
    datasetId ? getDynamicAttributeFacets(user.companyId, datasetId) : Promise.resolve([]),
  ]);

  return NextResponse.json({ facets: [...facets, ...dynamicFacets] });
}
