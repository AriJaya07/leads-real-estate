import { NextResponse } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { listRecentAlertDeliveries } from "@/application/alerting/alert-rules.queries";

/** Backs the topbar notification panel (`features/shell/components/notification-panel.tsx`). */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deliveries = await listRecentAlertDeliveries(user.companyId);
  return NextResponse.json({ deliveries });
}
