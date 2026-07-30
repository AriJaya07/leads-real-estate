import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { getLeadValidation } from "@/application/leads/lead-validation";

/**
 * Data validation + lead scoring for one lead — its own route for the same
 * reason `/api/leads/[leadId]/appearances` is: only needed for the one lead
 * currently open in the detail sheet, never for the list/card view.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId } = await params;
  const validation = await getLeadValidation(user.companyId, leadId);
  if (!validation) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  return NextResponse.json({ validation });
}
