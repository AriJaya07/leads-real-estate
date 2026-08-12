"use client";

import { createContext, useContext } from "react";
import type { VerticalFieldLabels } from "@/domain/verticals/catalog";

const DEFAULT_FIELD_LABELS: VerticalFieldLabels = {
  categoryField: "Categories",
  wants: "Interests",
  budget: "Budget",
  locations: "Locations",
  companyName: "Company name",
  companyNamePlaceholder: "Your company",
};

/**
 * Avoids threading a `fieldLabels` prop through every memoized component
 * between `LeadInbox` and wherever a label is actually rendered (`LeadCard`,
 * `LeadRow`, `LeadDetailSheet` — a separate, dynamically-imported file). Set
 * once at `LeadInbox`'s root from the server-fetched `companyFieldLabels`
 * (`CurrentUser.companyFieldLabels`, joined from `categories.field_labels`)
 * — consumed directly by whichever leaf component needs a category-aware
 * label.
 */
const FieldLabelsContext = createContext<VerticalFieldLabels>(DEFAULT_FIELD_LABELS);

export function FieldLabelsProvider({
  fieldLabels,
  children,
}: {
  fieldLabels: VerticalFieldLabels;
  children: React.ReactNode;
}) {
  return <FieldLabelsContext.Provider value={fieldLabels}>{children}</FieldLabelsContext.Provider>;
}

export function useFieldLabels(): VerticalFieldLabels {
  return useContext(FieldLabelsContext);
}
