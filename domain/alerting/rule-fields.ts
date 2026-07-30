import type { ComparisonOp } from "./predicate";

/**
 * Only channels with a real notifier adapter today
 * (`infrastructure/notifiers/registry.ts`) are offered by the rule builder —
 * `slack`/`inapp` exist in `alertChannelEnum` for a future adapter but would
 * silently fail every send today, which is worse than not offering them.
 */
export const RULE_CHANNELS = ["email", "whatsapp"] as const;
export type RuleChannel = (typeof RULE_CHANNELS)[number];

/**
 * The fields the alert-rule builder UI knows how to render a control for —
 * mirrors `toSubject()` in `application/alerting/dispatch.ts`, the actual
 * shape a predicate is evaluated against. Kept in one shared, framework-free
 * module so the server action's validation and the client form can't drift
 * into disagreeing about which fields exist.
 */
export const CONDITION_FIELDS = [
  "leadType",
  "buyerScore",
  "sellerScore",
  "investorScore",
  "confidenceScore",
  "propertyTypes",
  "locations",
  "budgetMin",
  "budgetMax",
  "hasContact",
  "name",
  "latestAppearanceAt",
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPS: readonly ComparisonOp[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "nin",
  "contains",
  "intersects",
  "exists",
  "within",
];
