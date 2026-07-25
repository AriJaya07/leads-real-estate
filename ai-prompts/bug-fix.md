# Bug Fix

Use this template when debugging and fixing a reported issue — a wrong score, a filter
returning the wrong rows, a sync that silently stops, a UI state that doesn't match the
data, etc.

## Context requirements

- [/agent-rules.md](../agent-rules.md) — especially the "never delete data" / "never
  abort a batch on one bad record" / "never overwrite `lead_states`" constraints, which
  rule out several tempting quick fixes.
- [docs/tech-debt.md](../docs/tech-debt.md) — check first: is this a *known* sharp edge
  (duplicated ranking formula, FX rate staleness, auto-approved mapping risk) rather
  than a new bug? Don't "fix" something that's a documented tradeoff without flagging
  it to the user.
- [docs/domain.md](../docs/domain.md) — make sure you're reasoning about the right
  concept (intent vs. quality vs. reach vs. priority are frequently confused; `leads` vs
  `lead_states` mutability differs).
- The relevant `*.test.ts` file next to the suspect code, if one exists — read it before
  changing behavior, since it may already encode the intended edge-case handling.

## Step-by-step

1. **Reproduce with the smallest possible input**, ideally as a failing unit test if the
   bug is in `domain/` (mapping, classification, predicate evaluation, ranking,
   scheduling) — these are pure functions, so this is usually fast and doesn't need a
   database.
2. **Find the root cause, not the symptom.** This codebase has a strong existing pattern
   of "why" comments documenting a specific past incident (see `mapping.ts`'s regex
   alternation-order comment, `schema-inference.ts`'s presence-counting comment,
   `sql-helpers.test.ts`'s array-binding comment). If you fix something non-obvious,
   leave a comment in the same style explaining what broke and why the fix works —
   future readers (human or agent) need that context to avoid re-breaking it.
3. **Check whether the bug is data-layer or presentation-layer.** A wrong number in the
   UI might be a wrong domain calculation, a wrong SQL query, or a stale cache tag not
   being invalidated (`application/cache-tags.ts`) — narrow it down before editing.
4. **Fix at the right layer.** Don't patch a `domain/` bug by special-casing it in
   `application/`; fix the pure function and let the fix propagate. If the bug is a
   classification/scoring miss (e.g. a phrase not being recognized, a false positive),
   the fix usually belongs in `domain/scoring/lexicon.ts` or `extractors.ts`, not in the
   classifier's control flow.
5. **Add the regression test.** Every fix to `domain/` or `application/leads/sql-helpers.ts`-style
   logic gets a test in the same commit. See
   [docs/testing-strategy.md](../docs/testing-strategy.md).
6. **Consider backfill.** If the bug affected already-ingested data (wrong scores, wrong
   mapping), the fix to the code doesn't retroactively correct existing rows — since
   `leads` is fully derived from `raw_records`, mention to the user whether a reprocess
   is needed and how that would work (re-running `processRawRecords` over the affected
   `raw_records`), rather than silently leaving stale bad data in place.
7. **Verify**: `npm run typecheck && npm run lint && npm test`.

## Expected output format

- Root cause, stated precisely (not "the filter was wrong" but "the filter used `eq`
  where the intended semantics needed `gte`, so exact-budget leads matched but
  above-budget leads didn't")
- The fix, and why it's correct at the source rather than papering over a symptom
- The regression test added (or a stated reason none was needed)
- Whether existing data needs a backfill/reprocess, and if so, roughly how

## Example

**Task**: "Buyer posts mentioning 'we are looking for a Property Manager' are showing up
as high-intent buyer leads."

- Root cause: `RECRUITMENT_PHRASES` in `domain/scoring/lexicon.ts` doesn't include
  "property manager" as a role, only broader recruitment phrases; `looking for` phrase
  in `BUYER_PHRASES` (weight 14) matches without a recruitment signal strong enough to
  trip `isRecruitment` (needs `recruitmentScore >= 40`).
- Fix: add "property manager", and other common Bali real-estate job titles, to
  `RECRUITMENT_PHRASES` at a weight consistent with the existing role-title entries
  (e.g. "years in real estate" at 40).
- Test: add a case to `domain/scoring/rules-classifier.test.ts` asserting this exact
  phrase classifies as `isSpam: true` via the recruitment path, not as `buyer`.
- Backfill: flag to the user that existing leads already classified before this fix
  keep their old (wrong) classification until reprocessed — recommend running a backfill
  over affected `raw_records` if precision on the alert channel matters immediately.
