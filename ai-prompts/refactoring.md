# Refactoring

Use this template for changes that are meant to preserve behavior while improving
structure, readability, or performance — not for feature work or bug fixes (see the
other templates for those).

## Context requirements

- [/agent-rules.md](../agent-rules.md) and [docs/architecture.md](../docs/architecture.md)
  — a refactor must not blur the domain/application/infrastructure boundary; that
  boundary is the main thing keeping this codebase testable and swappable.
- [docs/tech-debt.md](../docs/tech-debt.md) — check whether the thing you're about to
  "clean up" is actually a documented, deliberate tradeoff (e.g. the duplicated ranking
  formula, the auto-approve confidence threshold). Refactoring a deliberate tradeoff
  away without understanding why it exists turns a cleanup into a regression.
- The full test suite for anything you touch, read *before* refactoring — tests encode
  intent, and several in this repo exist specifically to pin down a past incident (see
  comments in `sql-helpers.test.ts`, `schema-inference.ts`). If a refactor makes a test
  awkward to keep passing, that's usually a signal to adjust the refactor, not delete or
  weaken the test.

## Step-by-step

1. **State the behavior-preservation boundary explicitly** before starting: what output,
   for what inputs, must stay identical. For domain functions this is usually "same
   function signature, same return value for every existing test case."
2. **Don't refactor and change behavior in the same diff.** If you notice a bug while
   refactoring, stop, note it separately, and either fix it as a distinct follow-up or
   get explicit sign-off to fold it in — mixing the two makes the diff impossible to
   review for either purpose.
3. **Preserve the pure/impure boundary.** Don't accidentally introduce `db()`/`fetch`
   calls into `domain/` while "simplifying" — if a domain function needs data it
   doesn't have, that data becomes a parameter, not a new import.
4. **Preserve or improve test coverage, never reduce it.** If you extract a function,
   its behavior should already have been under test before the extraction, or gains a
   test now — extraction is a good moment to add one that was missing.
5. **Run the full check before and after** to prove behavior preservation:
   `npm run typecheck && npm run lint && npm test`. Diff the test output, not just "it's
   green" — same count, same names, nothing silently skipped.
6. **Don't chase abstraction for its own sake.** This codebase favors concrete,
   readable, slightly-repetitive code over premature abstraction (see the "three similar
   lines is better than a premature abstraction" principle) — a refactor that introduces
   a generic helper used exactly once is not an improvement.

## Expected output format

- What changed structurally and why it's better (readability / duplication / performance
  — be specific, not "cleaner")
- Explicit confirmation that behavior is unchanged (test suite diff, or new tests added
  to prove it)
- Anything you noticed but deliberately did *not* fold into this refactor, and why

## Example

**Task**: "The `orderBy` switch in `lead-queries.ts` has grown a large inline SQL
template for the `priority` case — can you clean it up?"

- Acceptable: extract the inline SQL into a named, commented helper function
  (`prioritySortExpression()`) in the same file, with a comment noting it must stay in
  sync with `domain/lead/ranking.ts::priorityScore` (per
  [docs/tech-debt.md](../docs/tech-debt.md)) — no behavior change, purely readability.
  Confirm `sql-helpers.test.ts` and any `lead-queries` tests still pass unchanged.
- Not acceptable in the same diff: also "fixing" the recency half-life to match a
  different value you think looks more correct, or collapsing `intent`/`quality`/`reach`
  sort cases into one generic parameterized function that changes tie-breaking order —
  that's a behavior change wearing a refactor's clothes, and it needs its own review
  with its own tests.
