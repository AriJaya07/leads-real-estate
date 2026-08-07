/**
 * Shared long-form legal template — type scale, measure (68ch) and heading
 * rhythm are final; copy is a legal task, not a design one. Both `/privacy`
 * and `/terms` are design-complete and blocked only on legal-approved text —
 * see `docs/final-recommendations.md` Tier 1.
 */
export function LegalPage({
  title,
  updatedLabel = "Last updated · [date]",
  sections,
}: {
  title: string;
  updatedLabel?: string;
  sections: readonly { heading: string; body: string }[];
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-[68ch]">
        <p className="text-muted-foreground text-xs">{updatedLabel}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6 rounded-lg bg-[var(--health-warn-bg)] p-4 text-sm leading-relaxed text-[var(--health-warn-fg)]">
          <strong className="font-medium">Placeholder copy.</strong> This template is design-complete and blocked
          only on legal-approved text. Type scale, measure (68ch), heading rhythm and anchor list are final.
        </div>

        <div className="mt-10 flex flex-col gap-8">
          {sections.map((section, i) => (
            <div key={section.heading}>
              <h2 className="text-lg font-semibold tracking-tight">
                {i + 1}. {section.heading}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
