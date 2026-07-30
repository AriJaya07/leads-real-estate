"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { managerActionClient } from "@/application/safe-action";
import { scrapeRequestsTag } from "@/application/cache-tags";
import { startScrapeRequest } from "@/application/collection/start-scrape-request";
import { refreshScrapeStatus as refreshScrapeStatusImpl } from "@/application/collection/refresh-scrape-status";

/**
 * The user-facing side of this feature: pick a source (the template's platform),
 * pick requirements (the template's params), and the system does the rest —
 * selecting the actor (the template already pins it), sending parameters,
 * tracking the run. Storage/validation of the *results* happens later, in the
 * webhook (`app/api/webhooks/apify/route.ts`), by handing the run's output
 * dataset to the exact same discover→sync→normalize pipeline every other
 * dataset already goes through. All of the actual orchestration lives in
 * `start-scrape-request.ts` — this is just the auth-checked entry point, kept
 * thin so it's testable without a real session (see that module's tests).
 */
export const requestScrape = managerActionClient
  .inputSchema(
    z.object({
      actorTemplateId: z.string().uuid(),
      params: z.record(z.string(), z.unknown()).default({}),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await startScrapeRequest({
      companyId: ctx.user.companyId,
      requestedByUserId: ctx.user.userId,
      actorTemplateId: parsedInput.actorTemplateId,
      params: parsedInput.params,
    });
    updateTag(scrapeRequestsTag());
    return result;
  });

export const refreshScrapeStatus = managerActionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await refreshScrapeStatusImpl(ctx.user.companyId, parsedInput.id);
    updateTag(scrapeRequestsTag());
    return result;
  });
