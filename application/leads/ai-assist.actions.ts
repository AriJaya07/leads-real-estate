"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { authActionClient, ActionError } from "@/application/safe-action";
import { leadTag, leadsTag } from "@/application/cache-tags";
import { getCompanyPlan, incrementAiRequestUsage, isWithinAiRequestBudget } from "@/application/billing/usage";
import { hasFeature } from "@/domain/billing/plan-features";
import { serverEnv } from "@/shared/config/env";
import { generateLeadSummary } from "@/infrastructure/ai/lead-summary";
import { generateMessageDraft, type MessageDraftMode } from "@/infrastructure/ai/message-draft";
import { createLogger } from "@/infrastructure/observability/logger";
import { getLeadAppearances } from "./lead-queries";

const log = createLogger("leads:ai-assist");

function invalidate(leadId: string) {
  updateTag(leadTag(leadId));
  updateTag(leadsTag());
}

/**
 * Both AI-assist actions share this gate: an unconfigured deployment (no
 * `ANTHROPIC_API_KEY`) fails the same way regardless of plan, and a company
 * without the `aiAssistant` plan feature fails regardless of configuration —
 * this makes real, metered LLM calls, so unlike the rest of this app's
 * "fail open" limits it's deny-by-default, not best-effort.
 */
async function requireAiAssist(companyId: string): Promise<string> {
  const apiKey = serverEnv().ANTHROPIC_API_KEY;
  if (!apiKey) throw new ActionError("AI features aren't configured for this deployment.");

  const plan = await getCompanyPlan(companyId);
  if (!hasFeature(plan?.features, "aiAssistant")) {
    throw new ActionError("AI lead summaries and message drafting are available on the Business plan and above.");
  }
  if (!(await isWithinAiRequestBudget(companyId))) {
    throw new ActionError("Monthly AI usage limit reached for this company — try again next month.");
  }
  return apiKey;
}

async function loadLead(companyId: string, leadId: string) {
  const [lead] = await db()
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.companyId, companyId)))
    .limit(1);
  if (!lead) throw new ActionError("Lead not found.");
  return lead;
}

/** Prefer the USD-normalized budget when available — same convention `application/alerting/dispatch.ts::toSubject` uses, so a stated budget means the same thing regardless of source currency. */
function usdBudget(lead: { budgetMin: number | null; budgetMax: number | null; budgetUsdMin: number | null; budgetUsdMax: number | null; budgetCurrency: string | null }) {
  const budgetMin = lead.budgetUsdMin ?? lead.budgetMin;
  const budgetMax = lead.budgetUsdMax ?? lead.budgetMax;
  const budgetCurrency = lead.budgetUsdMin !== null || lead.budgetUsdMax !== null ? "USD" : lead.budgetCurrency;
  return { budgetMin, budgetMax, budgetCurrency };
}

/**
 * Generates and persists a plain-English summary of a lead — who they are,
 * what they want, how strong the opportunity is, and a first-message angle.
 * Cached on `leads.aiSummary` until explicitly regenerated (an agent action,
 * not automatic), so viewing the same lead twice costs one API call, not two.
 */
export const generateLeadSummaryAction = authActionClient
  .inputSchema(z.object({ leadId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const apiKey = await requireAiAssist(ctx.user.companyId);
    const lead = await loadLead(ctx.user.companyId, parsedInput.leadId);
    const appearances = await getLeadAppearances(ctx.user.companyId, parsedInput.leadId);

    const signals = appearances
      .filter((a) => a.body.trim().length > 0)
      .slice(0, 4)
      .map((a) => ({
        body: a.body,
        scoreReasons: a.scoreReasons.filter((r) => r.weight > 0).map((r) => r.label),
      }));

    let result;
    try {
      result = await generateLeadSummary(apiKey, {
        name: lead.name,
        leadType: lead.leadType,
        buyerScore: lead.buyerScore,
        sellerScore: lead.sellerScore,
        investorScore: lead.investorScore,
        confidenceScore: lead.confidenceScore,
        dataQualityTier: lead.dataQualityTier,
        propertyTypes: lead.propertyTypes,
        locations: lead.locations,
        hasContact: Boolean(lead.contact?.phone || lead.contact?.whatsapp || lead.contact?.email),
        appearanceCount: lead.appearanceCount,
        signals,
        ...usdBudget(lead),
      });
    } catch (error) {
      log.error("lead summary generation failed", {
        companyId: ctx.user.companyId,
        leadId: parsedInput.leadId,
        error: String(error),
      });
      throw new ActionError("Couldn't generate a summary right now — try again shortly.");
    }
    await incrementAiRequestUsage(ctx.user.companyId);

    await db()
      .update(schema.leads)
      .set({ aiSummary: result.summary, aiSummaryModel: result.model, aiSummaryGeneratedAt: new Date() })
      .where(and(eq(schema.leads.id, parsedInput.leadId), eq(schema.leads.companyId, ctx.user.companyId)));

    invalidate(parsedInput.leadId);
    return { summary: result.summary };
  });

/**
 * Drafts a WhatsApp message for this lead — first-contact framing if nobody's
 * reached them yet, follow-up framing (referencing days since last contact
 * and current pipeline status) otherwise. Not persisted: a draft is meant to
 * be edited and sent immediately, same "ephemeral until acted on" posture as
 * everything else on the contact path.
 */
export const generateMessageDraftAction = authActionClient
  .inputSchema(
    z.object({ leadId: z.string().uuid(), mode: z.enum(["first_contact", "follow_up"]).optional() }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const apiKey = await requireAiAssist(ctx.user.companyId);
    const lead = await loadLead(ctx.user.companyId, parsedInput.leadId);
    const appearances = await getLeadAppearances(ctx.user.companyId, parsedInput.leadId);

    const [state] = await db()
      .select({ status: schema.leadStates.status, firstContactedAt: schema.leadStates.firstContactedAt })
      .from(schema.leadStates)
      .where(eq(schema.leadStates.leadId, parsedInput.leadId))
      .limit(1);

    const mode: MessageDraftMode = parsedInput.mode ?? (state?.firstContactedAt ? "follow_up" : "first_contact");
    const latestBody = appearances.find((a) => a.body.trim().length > 0)?.body ?? null;
    const daysSinceLastContact = state?.firstContactedAt
      ? Math.max(1, Math.round((Date.now() - state.firstContactedAt.getTime()) / 86_400_000))
      : undefined;

    let message: string;
    try {
      message = await generateMessageDraft(apiKey, {
        mode,
        propertyTypes: lead.propertyTypes,
        locations: lead.locations,
        latestBody,
        status: state?.status,
        daysSinceLastContact,
        ...usdBudget(lead),
      });
    } catch (error) {
      log.error("message draft generation failed", {
        companyId: ctx.user.companyId,
        leadId: parsedInput.leadId,
        mode,
        error: String(error),
      });
      throw new ActionError("Couldn't draft a message right now — try again shortly.");
    }
    await incrementAiRequestUsage(ctx.user.companyId);

    return { message, mode };
  });
