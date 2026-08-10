import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { parseLeadFilters } from "@/application/leads/filters.schema";
import { queryLeads } from "@/application/leads/lead-queries";
import { leadStatusLabel } from "@/application/leads/lead-status";
import { toCsv } from "@/shared/csv";

/** Safety cap, not a page size — an export button that can accidentally request an unbounded result set is a real production incident, not a hypothetical one. */
const EXPORT_ROW_CAP = 5_000;

/**
 * CSV export of the leads matching the current filter/search — same
 * `parseLeadFilters`/`queryLeads` every other read of this data goes
 * through, just with `pageSize` raised to the export cap and `page` pinned
 * to 1, rather than a second lead-fetching code path.
 */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const filters = { ...parseLeadFilters(request.nextUrl.searchParams), page: 1, pageSize: EXPORT_ROW_CAP };
  const page = await queryLeads(user.companyId, filters);

  const csv = toCsv(page.items, [
    { header: "Name", value: (lead) => lead.name },
    { header: "Username", value: (lead) => lead.username },
    { header: "Lead type", value: (lead) => lead.leadType },
    { header: "Status", value: (lead) => leadStatusLabel(lead.status) },
    { header: "Buyer score", value: (lead) => lead.buyerScore },
    { header: "Confidence score", value: (lead) => lead.confidenceScore },
    { header: "Data quality", value: (lead) => lead.dataQualityTier },
    { header: "Property types", value: (lead) => lead.propertyTypes.join("; ") },
    { header: "Locations", value: (lead) => lead.locations.join("; ") },
    { header: "Budget min (USD)", value: (lead) => lead.budgetMin },
    { header: "Budget max (USD)", value: (lead) => lead.budgetMax },
    { header: "Budget currency", value: (lead) => lead.budgetCurrency },
    { header: "WhatsApp", value: (lead) => lead.contact.whatsapp },
    { header: "Phone", value: (lead) => lead.contact.phone },
    { header: "Email", value: (lead) => lead.contact.email },
    { header: "Assigned to", value: (lead) => lead.assignedToName },
    { header: "Bookmarked", value: (lead) => (lead.bookmarked ? "yes" : "no") },
    { header: "First contacted at (UTC)", value: (lead) => lead.firstContactedAt?.toISOString() },
    { header: "Deal value (USD)", value: (lead) => lead.dealValueUsd },
    { header: "Deal closed at (UTC)", value: (lead) => lead.dealClosedAt?.toISOString() },
    { header: "Created at (UTC)", value: (lead) => lead.createdAt.toISOString() },
  ]);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="averonai-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
