/**
 * A business vertical is a DB row (`categories` table,
 * `application/categories/categories.queries.ts`) as of the fully-dynamic
 * category system — see `docs/platform-super-admin-flow.md` §3. This file
 * now only owns the *shape* every category's field labels take, kept in
 * `domain/` because it's a pure type with no I/O, referenced by both the
 * `categories.field_labels` jsonb column and every UI that renders a
 * category-aware label ("Property types" vs. "Trip interests" vs. "Course
 * interests").
 */
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
