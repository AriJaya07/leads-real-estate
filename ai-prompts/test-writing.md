# Test Writing

Use this template when asked to add or improve test coverage, independent of a specific
feature or bug fix.

## Context requirements

- [docs/testing-strategy.md](../docs/testing-strategy.md) — what's actually worth
  testing here and what isn't; read this first, it will change what you write.
- An existing `*.test.ts` file in the same directory as your target, if one exists — for
  tone, structure, and what's already covered (don't duplicate an existing case under a
  different name).
- `vitest.config.ts` and `test/stubs/server-only.ts` if the target module has
  `import "server-only"` at the top — you'll need the alias, already configured, not a
  new mock.

## What to prioritize

In order, given limited time:
1. `domain/` functions with no test yet, especially ones with subtle text-processing
   logic (extraction, classification, mapping) where a wrong edge case has real business
   cost (a wrong phone number extracted sends an agent to a stranger; a false-positive
   buyer classification pages the whole sales team about a job post).
2. Regression tests for anything the user describes as "this broke before" — even if
   you can't reproduce the original bug, ask what broke and encode it as a test rather
   than skipping it.
3. Security-relevant paths: constant-time comparison behavior, SQL parameter binding
   (never inlining a value into SQL text), enum validation against untrusted input.
4. Anything with a documented formula/threshold (scoring weights, the recency half-life,
   the auto-approve confidence floor) — pin the current behavior with a test even if
   nothing is currently broken, so a future change to the constant is caught if it
   wasn't intentional.

## What NOT to write

- Don't write tests for `infrastructure/` adapters by mocking `fetch` line-by-line —
  see [docs/testing-strategy.md](../docs/testing-strategy.md) for why that's low-value
  here. If asked to test `apify.connector.ts`, prefer a real (sandboxed/dry-run) call or
  say explicitly that a mock-heavy unit test wouldn't catch real regressions.
- Don't write a component/UI test unless the user specifically asks and understands
  there's no existing RTL setup pattern in this repo to follow — you'd be establishing a
  new convention, not following one, and should flag that.
- Don't test `application/*.actions.ts` by mocking `db()` — if you need confidence at
  that layer, say so and propose an integration-test approach against a real test
  database instead of a mock-riddled unit test that mostly asserts the mock was called.

## Step-by-step

1. Read the target function/module fully, including any existing "why" comments — they
   often describe the exact edge case that needs a test.
2. Identify 2–4 concrete scenarios: the happy path, a documented edge case (e.g.
   negation, missing data, malformed input), and — if relevant — a known false-positive
   class already named in the code (e.g. recruitment-vs-buyer, dates-vs-phone-numbers).
3. Write tests calling the function directly with constructed input — no mocking. If
   mocking feels necessary, that's a signal to restructure the function to take its
   dependency as a parameter instead (flag this to the user rather than mocking around
   it).
4. Name each `it()` as a plain-English behavior statement, present tense, no "should" —
   match the existing tone (e.g. `"binds each element as its own parameter"`).
5. Run `npm test` and confirm the new tests actually exercise the intended branch (a
   test that passes for the wrong reason is worse than no test — check it fails if you
   temporarily break the target code).

## Expected output format

- The test file (new or amended) with a short note on which scenarios it covers and why
  those were chosen over others
- Confirmation the new tests fail against the pre-fix code (if this accompanies a bug
  fix) or pass cleanly against current code (if this is coverage-only)

## Example

**Task**: "Add coverage for negation handling in the intent classifier."

- Target: `domain/scoring/rules-classifier.ts` via `classifyWithRules`, backed by
  `matchPhrases`/`isNegated` in `domain/scoring/extractors.ts`.
- Scenarios: `"not looking for buyers"` should not register a buyer-intent hit;
  `"looking for buyers, not sellers"` should still register the buyer-intent hit (the
  negation window is 24 characters back from the match, so a negator *after* the phrase
  must not suppress it); a negator far outside the window (`NEGATION_WINDOW = 24`) should
  not suppress a legitimate match.
- Add these to `domain/scoring/rules-classifier.test.ts` (or `extractors.test.ts` if
  testing `isNegated` directly is a better fit — check which file already covers
  adjacent cases before choosing).
