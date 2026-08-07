import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/application/api-keys/authenticate";
import { checkApiRateLimit } from "@/application/api-keys/rate-limiter";
import { parseLeadFilters } from "@/application/leads/filters.schema";
import { queryLeads } from "@/application/leads/lead-queries";

/**
 * The public API's one and only endpoint (see `/docs/api`). Bearer-token
 * counterpart to `app/api/leads/route.ts` — same filter parsing, same
 * `queryLeads`, same response shape, so an external consumer sees exactly
 * what an agent sees in the inbox (contact info, AI summary, everything) —
 * no separate, trimmed public representation of a lead.
 */
export async function GET(request: NextRequest) {
  const principal = await authenticateApiKey(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decision = await checkApiRateLimit(principal.apiKeyId, principal.companyId);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: decision.retryAfterSeconds ? { "Retry-After": String(decision.retryAfterSeconds) } : undefined,
      },
    );
  }

  const filters = parseLeadFilters(request.nextUrl.searchParams);
  const page = await queryLeads(principal.companyId, filters);
  return NextResponse.json({ page });
}
