# Code Review

Use this template when reviewing a pull request or a working diff against this
codebase's conventions. For the interactive `/code-review` flow see that skill; this
template is for what to actually check, project-specific.

## Context requirements

- [/agent-rules.md](../agent-rules.md) — the hard constraints below are mostly drawn
  from here; treat violations as blocking, not stylistic.
- [docs/coding-standards.md](../docs/coding-standards.md), especially the Next 16 API
  section — a "fix" that reverts `proxy.ts`/`updateTag`/`after()` to an older Next API
  shape is a regression, not a cleanup, and is an easy mistake for an agent unfamiliar
  with this repo's Next version.
- [docs/api-patterns.md](../docs/api-patterns.md) — server action / route handler shape

## Checklist

**Layering**
- [ ] No `infrastructure/` import inside `domain/`.
- [ ] No raw `db()`/Drizzle call inside `domain/` — domain functions take/return plain data.
- [ ] New external integration is a new adapter + registry entry, not a vendor-specific
      branch inside `sync-dataset.ts` or `dispatch.ts`.
- [ ] `import "server-only"` present on new `application/`/`infrastructure/` modules
      that touch secrets, the DB, or Node built-ins.

**Server actions / routes**
- [ ] Every action has `.inputSchema(zodSchema)` — no untyped input.
- [ ] Narrowest client used (`authActionClient` vs `adminActionClient`), not a global
      "just works" client.
- [ ] User-facing errors thrown as `ActionError(message)`; anything else logged and
      genericized, not leaked to the client.
- [ ] Cache invalidation present and using the right primitive: `updateTag` for
      actor-visible-immediately changes, `revalidateTag(tag, "max")` for
      cron/webhook-triggered background refresh — via `application/cache-tags.ts`
      helpers, not a hand-written tag string.
- [ ] Cron/webhook routes check their secret with `secretsMatch()`, not `===`.

**Data integrity**
- [ ] No code path overwrites an existing `lead_states` row from pipeline/reprocessing
      logic (only `onConflictDoNothing` on first creation is allowed there).
- [ ] No hard deletes of `raw_records`/`leads`/duplicate leads — missing/superseded data
      is flagged, not removed.
- [ ] Batch ingestion (`processRawRecords`-style code) catches per-item; one bad record
      can't abort the whole run.
- [ ] Raw JS arrays never interpolated directly into a Drizzle `sql` template —
      `textArray()` or equivalent parameter binding used instead.
- [ ] User-controlled values reaching an enum column are validated against the real
      enum first (`validIntents`/`validStatuses` pattern), not passed through raw.

**Domain correctness**
- [ ] `reach`/engagement is not folded into `intentScore` or `priorityScore`.
- [ ] Intent/quality/reach remain conceptually separate per
      [docs/domain.md](../docs/domain.md) — a diff that conflates them needs a strong
      justification, not just a shrug.
- [ ] If a scoring/mapping weight changed, there's a test pinning the before/after on a
      representative phrase — not just "trust me, this reads better now."
- [ ] If `domain/lead/ranking.ts`'s formula changed, the duplicated SQL expression in
      `application/leads/lead-queries.ts`'s `orderBy` was updated to match (see
      [docs/tech-debt.md](../docs/tech-debt.md) — this is a known footgun, not obvious
      from the diff alone).

**Testing**
- [ ] New/changed `domain/` logic has a test in the same diff.
- [ ] Test names describe behavior in plain English (existing style), not "should X".
- [ ] No new mocking introduced for something that could instead take its dependency as
      plain data (a signal the function needs restructuring, not a mock).

**Style**
- [ ] Comments explain *why* (a constraint, a past incident, a non-obvious tradeoff),
      not *what* the code already says.
- [ ] Naming matches existing conventions (kebab-case files, `.actions.ts`/`-queries.ts`
      suffixes, named exports only).

## Expected output format

Findings ordered most-severe first. For each: file/line, the concrete problem, the
concrete fix. Skip praise and skip restating what the diff obviously does. If nothing
survives review, say so plainly rather than inventing minor nitpicks to justify the pass.

## Example finding

> `application/leads/lead.actions.ts` — `toggleBookmark` updates `lead_states` but never
> inserts a `lead_events` row, unlike every sibling action in this file
> (`setLeadStatus`, `assignLead`, `markContacted`, `saveLeadNotes` all log an event on
> mutation). Bookmarking silently drops out of the audit trail. Either add a
> `lead_event_type` for it and log it, or confirm with the user that bookmarks are
> intentionally excluded from the audit trail before leaving it as-is.
