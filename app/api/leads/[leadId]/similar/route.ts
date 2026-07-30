import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { getSimilarLeads } from "@/application/leads/lead-queries";

/** "Leads like this one" — backs the detail sheet's recommendations section. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId } = await params;
  const leads = await getSimilarLeads(user.companyId, leadId);
  return NextResponse.json({ leads });
}
