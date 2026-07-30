import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { getLeadEvents } from "@/application/leads/lead-queries";

/** Status/assignment/note/contact/alert/merge history — backs the detail sheet's "Activity" timeline. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId } = await params;
  const events = await getLeadEvents(user.companyId, leadId);
  return NextResponse.json({ events });
}
