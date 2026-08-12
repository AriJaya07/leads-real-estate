"use client";

import { createContext, useContext } from "react";
import { VERTICALS, fieldLabelsFor, type CompanyCategory, type VerticalFieldLabels } from "@/domain/verticals/catalog";

/**
 * Avoids threading a `fieldLabels`/`companyCategory` prop through every
 * memoized component between `LeadInbox` and wherever a label is actually
 * rendered (`LeadCard`, `LeadRow`, `LeadDetailSheet` — a separate,
 * dynamically-imported file). Set once at `LeadInbox`'s root from the
 * server-provided `companyCategory`; consumed directly by whichever leaf
 * component needs a category-aware label.
 */
const FieldLabelsContext = createContext<VerticalFieldLabels>(VERTICALS.other.fieldLabels);

export function FieldLabelsProvider({
  category,
  children,
}: {
  category: CompanyCategory;
  children: React.ReactNode;
}) {
  return <FieldLabelsContext.Provider value={fieldLabelsFor(category)}>{children}</FieldLabelsContext.Provider>;
}

export function useFieldLabels(): VerticalFieldLabels {
  return useContext(FieldLabelsContext);
}
