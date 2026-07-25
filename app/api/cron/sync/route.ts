import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { dueDatasets, syncDataset, type SyncOutcome } from "@/application/sync/sync-dataset";
import { readBearer, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { datasetTag, leadsTag } from "@/application/cache-tags";

export const maxDuration = 300;

/**
 * Scheduled sync tick. Processes the datasets whose adaptive interval is due,
 * oldest-due first, so no single dataset can starve the others.
 */
export async function GET(request: Request) {
  if (!secretsMatch(readBearer(request), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ids = await dueDatasets(10);
  const outcomes: SyncOutcome[] = [];

  for (const id of ids) {
    const outcome = await syncDataset(id, "cron");
    outcomes.push(outcome);

    if (outcome.leadsCreated > 0 || outcome.itemsNew > 0) {
      // `revalidateTag` with the 'max' profile gives stale-while-revalidate:
      // the dashboard keeps serving instantly while fresh aggregates rebuild.
      revalidateTag(datasetTag(id), "max");
      revalidateTag(leadsTag(), "max");
    }
  }

  return NextResponse.json({ ok: true, processed: outcomes.length, outcomes });
}
