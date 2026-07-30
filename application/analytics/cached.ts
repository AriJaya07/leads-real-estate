import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { leadsTag } from "@/application/cache-tags";
import { getRevenueSummary, type RevenueSummary } from "./revenue";
import { getConversionFunnel, type ConversionFunnel } from "./conversion";
import { getSourcePerformance, type SourcePerformance } from "./source-performance";
import { getAgentPerformance, type AgentPerformance } from "./agent-performance";
import { getActivityTrend, type ActivityTrendPoint } from "./activity-trend";

/**
 * Thin `"use cache"` boundary in front of this module's query functions, kept
 * separate from them (rather than adding the directive directly to
 * `getRevenueSummary`/etc.) because those functions are called directly —
 * outside any Next.js request context — by their own `*.integration.test.ts`
 * suites, and `"use cache"` throws when invoked outside a real Next.js
 * runtime. Same `leadsTag()`/`"minutes"` lifecycle `application/leads/lead-queries.ts`
 * already uses for `getLeadStats`/`getLeadTrend`/`getBudgetStats`.
 */

export async function getCachedRevenueSummary(companyId: string, days = 30): Promise<RevenueSummary> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());
  return getRevenueSummary(companyId, days);
}

export async function getCachedConversionFunnel(companyId: string): Promise<ConversionFunnel> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());
  return getConversionFunnel(companyId);
}

export async function getCachedSourcePerformance(companyId: string): Promise<SourcePerformance[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());
  return getSourcePerformance(companyId);
}

export async function getCachedAgentPerformance(companyId: string): Promise<AgentPerformance[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());
  return getAgentPerformance(companyId);
}

export async function getCachedActivityTrend(companyId: string, days = 30): Promise<ActivityTrendPoint[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());
  return getActivityTrend(companyId, days);
}
