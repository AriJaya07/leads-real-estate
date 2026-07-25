import { NextResponse } from "next/server";
import { pruneOldRows } from "@/application/maintenance/prune-old-rows";
import { readBearer, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";

/** Weekly cleanup of append-only tables nothing else prunes — see prune-old-rows.ts. */
export async function GET(request: Request) {
  if (!secretsMatch(readBearer(request), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pruneOldRows();
  return NextResponse.json({ ok: true, ...result });
}
