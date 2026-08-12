/**
 * Company category (business vertical), chosen once at signup. Pure — no
 * framework, no I/O. Same duplication pattern as `domain/auth/permissions.ts`'s
 * `Role`/`ROLES`: this file owns the canonical type + value list,
 * `infrastructure/db/schema/enums.ts::companyCategoryEnum` duplicates the same
 * literal values for the DB enum (domain imports nothing, so it can't import
 * from infra to share the array).
 *
 * What a category actually changes, today:
 *  - `domain/scoring/lexicon-registry.ts` — which intent-phrase lexicon
 *    scores a lead's text (buyer/seller/agent phrases differ by vertical).
 *  - Field labels below — the same underlying columns (`propertyTypes`,
 *    budget, locations) are relabeled per category rather than duplicated
 *    into vertical-specific columns; see `infrastructure/db/schema/leads.ts`'s
 *    "open vocabulary" columns, which were already vertical-agnostic in shape.
 *  - `actor_templates.category` — which registered Apify actors get
 *    surfaced first at `/admin/collection`.
 *
 * What a category deliberately does NOT change: `leadTypeEnum`
 * (buyer/seller/agent/broker/investor) stays one fixed set across every
 * category — see that enum's comment for why a new column is cheap to add
 * later but a per-vertical enum isn't worth the complexity yet.
 */

export type CompanyCategory = "real_estate" | "travel" | "courses" | "other";

export const COMPANY_CATEGORIES: readonly CompanyCategory[] = ["real_estate", "travel", "courses", "other"];

export function isCompanyCategory(value: string): value is CompanyCategory {
  return (COMPANY_CATEGORIES as readonly string[]).includes(value);
}

export interface VerticalFieldLabels {
  /** Label for the `propertyTypes` column's UI — what kind of thing a lead wants. */
  categoryField: string;
  /** Label for the lead-detail "wants" summary field. */
  wants: string;
  /** Label for the budget range field/filter. */
  budget: string;
  /** Label for the `locations` column — where, not what. */
  locations: string;
  /** Label for the company-name field on step 2 of `/signup` — "Agency" reads oddly for a course provider. */
  companyName: string;
  /** Placeholder example for that same field. */
  companyNamePlaceholder: string;
}

export interface VerticalDefinition {
  id: CompanyCategory;
  label: string;
  /** One line, shown on the signup category-picker card. */
  description: string;
  fieldLabels: VerticalFieldLabels;
}

export const VERTICALS: Record<CompanyCategory, VerticalDefinition> = {
  real_estate: {
    id: "real_estate",
    label: "Real Estate",
    description: "Villas, land, and property — buyers, sellers, agents, and investors.",
    fieldLabels: {
      categoryField: "Property types",
      wants: "Property types",
      budget: "Budget",
      locations: "Locations",
      companyName: "Agency name",
      companyNamePlaceholder: "Bukit Villa Partners",
    },
  },
  travel: {
    id: "travel",
    label: "Travel",
    description: "Trips, tours, and stays — travelers, operators, and agents.",
    fieldLabels: {
      categoryField: "Trip types",
      wants: "Trip interests",
      budget: "Budget",
      locations: "Destinations",
      companyName: "Company name",
      companyNamePlaceholder: "Nomad Journeys Co",
    },
  },
  courses: {
    id: "courses",
    label: "Courses",
    description: "Classes, certifications, and workshops — students, providers, and referrers.",
    fieldLabels: {
      categoryField: "Course types",
      wants: "Course interests",
      budget: "Budget",
      locations: "Locations",
      companyName: "Provider name",
      companyNamePlaceholder: "Bali Yoga Academy",
    },
  },
  other: {
    id: "other",
    label: "Other",
    description: "A different kind of business — generic labels and classifier by default.",
    fieldLabels: {
      categoryField: "Categories",
      wants: "Interests",
      budget: "Budget",
      locations: "Locations",
      companyName: "Company name",
      companyNamePlaceholder: "Your company",
    },
  },
};

export function fieldLabelsFor(category: CompanyCategory): VerticalFieldLabels {
  return VERTICALS[category].fieldLabels;
}
