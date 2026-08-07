"use server";

import { z } from "zod";
import { managerActionClient } from "@/application/safe-action";
import { listOnboardingCandidates } from "@/application/datasets/dataset-queries";
import { previewSource, getDatasetLabel } from "./preview-source";

/** Step 1's picker — same manager+ gate as every other `/admin/collection` action. */
export const listOnboardingCandidatesAction = managerActionClient.action(async ({ ctx }) => {
  return listOnboardingCandidates(ctx.user.companyId);
});

/** Step 2's "here's what we found" preview — read-only, see preview-source.ts for why nothing is saved. */
export const previewSourceAction = managerActionClient
  .inputSchema(z.object({ datasetId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [result, label] = await Promise.all([
      previewSource(ctx.user.companyId, parsedInput.datasetId),
      getDatasetLabel(ctx.user.companyId, parsedInput.datasetId),
    ]);
    return { ...result, label };
  });
