# Testing Strategy

## Tooling

Vitest (`vitest.config.ts`), `environment: "node"` (no jsdom for domain/application
tests — see `test/stubs/server-only.ts` for how `server-only` imports are neutralized
under test). `@testing-library/react` + `jsdom` are devDependencies for future component
tests but no component test exists yet — see [tech-debt.md](tech-debt.md).

```bash
npm test          # vitest run — 64 tests as of this writing (domain + auth + sql-helpers)
npm run test:watch
```

`.husky/pre-commit` runs `npm test` on every commit — a broken test blocks the commit.
Keep the suite fast; don't add anything that touches a real network or a real database.

## What is actually tested today

All `*.test.ts` files sit next to the code they test (no separate `__tests__` tree):

- `domain/alerting/predicate.test.ts`
- `domain/dataset/mapping-proposal.test.ts`
- `domain/dataset/mapping.test.ts`
- `domain/dataset/schema-inference.test.ts`
- `domain/scoring/rules-classifier.test.ts`
- `domain/sync/scheduling.test.ts`
- `infrastructure/auth/password.test.ts`
- `application/leads/sql-helpers.test.ts`

That list is the map of what this codebase considers worth guaranteeing: the pure
domain logic (mapping, classification, scheduling, predicates) plus the two places where
a subtle bug has real consequences — password hashing and raw SQL array binding.

## What to unit test

Anything in `domain/` is a strong candidate by default — it's pure, dependency-free,
and the whole point of the domain/application/infrastructure split is that this layer
is trivially testable without mocks. When adding to `domain/`, add tests in the same
pass, not as follow-up.

Specifically test:
- **Edge cases in text extraction/classification** (`rules-classifier.test.ts`,
  `mapping.test.ts`) — negation ("not looking for buyers"), mixed signals (buyer phrase
  + seller phrase in the same post), locale variants (Indonesian phrases), and the
  known false-positive classes already caught in production (recruitment posts scoring
  as buyer intent — see `RECRUITMENT_PHRASES` in `domain/scoring/lexicon.ts`).
- **Regressions with a concrete production incident behind them.** The existing tests
  lean heavily on this — see the comment on the `textArray` tests in
  `sql-helpers.test.ts` ("interpolating a JS array... 500'd with `Array value must
  start with "{"`"), and the presence-counting comment in `schema-inference.ts`. When
  you fix a bug in `domain/` or `application/`, add the regression test in the same
  commit, with a comment naming what broke — that comment is what lets a future agent
  understand *why* the test exists instead of "helpfully" deleting it as redundant.
- **Anything security-adjacent**: constant-time comparison behavior, password hash
  round-tripping, SQL injection resistance (the `sql-helpers.test.ts` "never inlines
  values" test is the template — assert the malicious string appears only in `params`,
  never in the compiled SQL text).
- **Scoring/ranking formulas** when you change a weight or a threshold — a classifier
  weight change is silent drift unless a test pins the expected before/after.

## What NOT to bother unit testing

- `infrastructure/` adapters that are thin wrappers over an external API
  (`apify.connector.ts`) — there's no test for it today; if you add one, prefer a
  contract/integration test behind a flag over mocking `fetch` line-by-line, since a
  mock-heavy test of a thin adapter mostly tests the mock.
- Server actions and route handlers themselves (`application/*.actions.ts`,
  `app/api/**`) — they're thin orchestration over already-tested domain functions plus
  Drizzle calls. If you need confidence here, that's an integration-test concern (see
  below), not a unit test with a mocked `db()`.
- UI components — no test setup exists for them yet. If the user is asking you to
  verify a UI change, run the dev server and check it manually (see the root
  `run` skill) rather than writing a throwaway RTL test that won't be maintained.

## Mocking guidance

There is essentially no mocking in this codebase's test suite — domain functions take
plain data and return plain data, so tests call them directly with constructed input and
assert on the output (see any test file for the pattern: no `vi.mock`, no test doubles).
If you find yourself reaching for `vi.mock` to test something in `domain/`, that's a
signal the function has a hidden I/O dependency and should be restructured to take that
dependency as data/a parameter instead — don't paper over it with a mock.

## Test file structure

- One `.test.ts` file per source file, same directory, same base name
  (`mapping.ts` → `mapping.test.ts`).
- `describe` blocks group by exported function; `it` descriptions state the behavior in
  plain English, not "should X" — see existing files for tone (`"binds each element as
  its own parameter"`, not `"should bind elements"`).
- Prefer several small, precisely-named `it` blocks over one large test with multiple
  assertions about unrelated behavior — makes a failure immediately legible.

## Coverage expectations

No enforced coverage threshold or CI gate exists in this repo (no `coverage` config in
`vitest.config.ts`, no coverage step in `.husky/pre-commit`). Use judgment: domain logic
with real business consequences (scoring, mapping, dedup, alerting) should be
well-covered; thin plumbing does not need a test to exist for its own sake.
