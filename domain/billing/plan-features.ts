/**
 * The shape of `plans.features` (jsonb). A closed, typed set — not an open
 * bag — because every flag here gates a real code path (see call sites of
 * `hasFeature`); an untyped flag nobody reads is dead config. Add a field
 * here only when you're also adding the check that reads it.
 */
export interface PlanFeatures {
  /** Gates the `whatsapp` alert channel (`alertChannelEnum`) — see application/alerting/dispatch.ts. */
  whatsappAlerts: boolean;
  /** Gates the optional shadow LLM classifier per company, on top of the global env kill-switch. */
  llmShadowClassify: boolean;
  /** Display-only for now (no code path yet) — advertised in the pricing/comparison page. */
  customBranding: boolean;
  /** Display-only for now (no code path yet) — advertised in the pricing/comparison page. */
  prioritySupport: boolean;
  /** Display-only for now (no code path yet, SSO isn't built) — advertised in the pricing/comparison page. */
  sso: boolean;
}

export const NO_PLAN_FEATURES: PlanFeatures = {
  whatsappAlerts: false,
  llmShadowClassify: false,
  customBranding: false,
  prioritySupport: false,
  sso: false,
};

export function hasFeature(features: PlanFeatures | null | undefined, key: keyof PlanFeatures): boolean {
  return Boolean(features?.[key]);
}
