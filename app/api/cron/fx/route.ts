import { NextResponse } from "next/server";
import { refreshFxRates } from "@/application/fx/refresh-fx-rates";
import { readBearer, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";

/**
 * Daily FX refresh — see `application/fx/refresh-fx-rates.ts`. Rates don't move
 * fast enough to need the 5/15-minute cadence of sync/discovery, so this gets
 * its own, much slower, schedule in `vercel.json`.
 */
export async function GET(request: Request) {
  if (!secretsMatch(readBearer(request), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshFxRates();
  return NextResponse.json({ ok: true, ...result });
}
