import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { parseLeadFilters } from "@/application/leads/filters.schema";
import { queryLeads } from "@/application/leads/lead-queries";

/**
 * Backs the client-side lead list query (`features/leads/queries.ts`) once
 * the initial server-rendered page has hydrated — every filter/sort/page
 * change after that re-fetches through here instead of a full Next
 * navigation. Read-only, so treated like any other authenticated read: a
 * signed-in check, same as the DAL pattern every page already follows (see
 * docs/architecture.md's Auth model) — not gated on `mustChangePassword`,
 * since blocking *reads* has no security rationale the way blocking mutations
 * did in `authActionClient`.
 */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const filters = parseLeadFilters(request.nextUrl.searchParams);
  const page = await queryLeads(filters);
  return NextResponse.json({ page });
}
