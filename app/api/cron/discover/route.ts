import { NextResponse } from "next/server";
import { discoverAllSources } from "@/application/sync/discovery";
import { readBearer, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";

/**
 * Scheduled dataset discovery. This is what replaces editing an env var when
 * n8n produces a new dataset: it appears in the registry on the next pass.
 */
export async function GET(request: Request) {
  if (!secretsMatch(readBearer(request), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await discoverAllSources();
  return NextResponse.json({ ok: true, results });
}
