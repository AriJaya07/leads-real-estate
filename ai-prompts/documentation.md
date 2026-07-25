# Documentation

Use this template when asked to write or update documentation — code comments,
`/docs/*.md`, README updates, or this prompt library itself.

## Context requirements

- The actual current code, read in full — every doc in this repo is meant to describe
  what's true *now*, grounded in specific files. Don't extrapolate from a file's name or
  a variable's name; open it and check.
- [docs/coding-standards.md](../docs/coding-standards.md)'s comment-style section — this
  applies to both inline code comments and prose docs: explain *why*, not *what*.

## Principles specific to this repo

- **Every non-trivial claim should be traceable to a file.** The existing docs
  (`README.md`, and now `/docs/*.md`) consistently link or name-drop the specific
  function/file backing a claim (e.g. "see `nextIntervalSeconds` in
  `domain/sync/scheduling.ts`"). Keep that pattern — it's what makes the docs
  verifiable and keeps them from rotting silently into fiction.
- **Prefer "why" over "what."** A doc that says "the `leads` table stores leads" is
  worthless. A doc that says "`leads` is fully derived and rebuildable from
  `raw_records`, which is why reprocessing is safe to run at any time" is what this
  codebase's existing comments already model — match that register.
- **Don't document aspirational behavior as current.** If something is planned but not
  built (see [docs/prd.md](../docs/prd.md)'s roadmap), say so explicitly — "not built
  yet" — rather than describing the intended design as if it already works. This
  codebase already draws that line carefully (e.g. the `LeadClassifier` port exists,
  but no LLM classifier is implemented) and blurring it misleads whoever reads the doc
  next, human or agent.
- **Cross-link instead of duplicating.** The `/docs` set is intentionally
  cross-referential (architecture → domain → tech-debt) rather than each file repeating
  context. When adding new documentation, link to the relevant existing doc rather than
  re-explaining a concept that already has a canonical home.
- **Code comments stay terse; prose docs can be longer.** A code comment earns its place
  by encoding something not visible in the diff (a past incident, a non-obvious
  constraint). A markdown doc has more room to explain, but should still be edited down
  — prefer a tight paragraph with a code reference over a long one restating the code.

## Step-by-step

1. Identify which of the required docs (`architecture.md`, `coding-standards.md`,
   `api-patterns.md`, `prd.md`, `domain.md`, `tech-debt.md`, `testing-strategy.md`,
   `environment.md`, `agent-rules.md`) the change actually belongs in — most edits touch
   exactly one; if it seems to need edits across several, that's a signal the change is
   large enough to double check scope with the user first.
2. Read the current version of that doc plus the code it describes, side by side.
3. Make the smallest edit that keeps the doc accurate — don't rewrite an entire section
   to fix one stale sentence.
4. If a claim in an existing doc is now wrong because of a code change you made
   elsewhere, update the doc in the same task — don't leave it to drift, and don't treat
   doc updates as optional cleanup for "later."
5. Re-read the edited section once more against the actual code before finishing —
   confirm every function/file name mentioned still exists and does what's claimed.

## Expected output format

The edited doc file(s), plus a one-line note on what changed and which code it's now
grounded in. No separate "documentation summary" document unless explicitly asked.

## Example

**Task**: "We just added a `slack` notifier — update the docs."

- `docs/prd.md`: remove `whatsapp`/Slack from the "not built yet" notifier bullet if
  Slack is now implemented (check `infrastructure/notifiers/registry.ts` for what's
  actually registered — don't assume from the enum alone, since
  `alertChannelEnum` already lists `whatsapp`/`slack`/`inapp` without them being built).
- `docs/architecture.md` / `agent-rules.md`: no change needed if the "new channel = new
  adapter in the registry" pattern was followed — the doc already describes the pattern
  generically and doesn't need updating just because a new instance of it exists.
- `docs/tech-debt.md`: if WhatsApp is *still* unimplemented, leave that note in place;
  don't let one channel shipping imply the other did too.
