type Step = { title: string; description: string };

/**
 * Horizontal connected-node diagram (numbered nodes on a path) for 4 steps.
 * Collapses to a vertical connected line on narrow screens. Home-page only —
 * Guide's own step sequence uses a different (vertical timeline) treatment so
 * the two "sequence" pages don't read as the same component.
 */
export function HowItWorksDiagram({ steps }: { steps: readonly Step[] }) {
  const positions = steps.map((_, i) => 12.5 + i * (75 / (steps.length - 1)));

  return (
    <div className="relative">
      <svg
        viewBox="0 0 100 4"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 top-[19px] hidden h-1 w-full sm:block"
        aria-hidden
      >
        <line
          x1={positions[0]}
          y1="2"
          x2={positions[positions.length - 1]}
          y2="2"
          className="stroke-border"
          strokeWidth="0.5"
          strokeDasharray="1.5 2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <ol className="relative grid gap-10 sm:grid-cols-4 sm:gap-6">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-4 sm:flex-col sm:gap-3">
            <span
              className="border-brand bg-background text-brand relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-serif text-sm font-semibold italic"
              aria-hidden
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {index < steps.length - 1 && (
              <span className="bg-border absolute top-10 left-5 h-full w-px sm:hidden" aria-hidden />
            )}
            <div className="pt-1.5 sm:pt-0">
              <h3 className="font-semibold tracking-tight">{step.title}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
