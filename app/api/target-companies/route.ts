import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/application/auth/current-user";
import { searchTargetCompanies } from "@/application/companies/target-company-queries";

/** Backs the lead detail sheet's "link a company" search-as-you-type combobox. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const companies = await searchTargetCompanies(user.companyId, q);
  return NextResponse.json({ companies });
}
