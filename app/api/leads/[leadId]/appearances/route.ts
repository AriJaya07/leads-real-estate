import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { getLeadAppearances } from "@/application/leads/lead-queries";

/**
 * Every source a lead was collected from — backs the detail sheet's "Sources"
 * list. Its own route rather than folding into `LeadListItem` (`/api/leads`)
 * because the list query stays cheap for pagination; the full appearance
 * history is only ever needed for the one lead currently open in the sheet.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId } = await params;
  const appearances = await getLeadAppearances(user.companyId, leadId);
  return NextResponse.json({ appearances });
}
