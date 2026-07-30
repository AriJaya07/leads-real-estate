import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { getAffiliationsForLead } from "@/application/companies/target-company-queries";

/** Every target company this lead is linked to — backs the detail sheet's "Affiliated companies" section. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId } = await params;
  const affiliations = await getAffiliationsForLead(user.companyId, leadId);
  return NextResponse.json({ affiliations });
}
