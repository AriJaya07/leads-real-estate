# Feature Development

Use this template when building new functionality — a new filter, a new admin screen, a
new alert channel, a new field on the canonical lead spine, etc.

## Context requirements

Before starting, the agent should have read (or be pointed at):

- [/agent-rules.md](../agent-rules.md) — hard constraints
- [docs/architecture.md](../docs/architecture.md) — layering and data flow
- [docs/domain.md](../docs/domain.md) — is this feature about a concept that already
  has a name and a home? (intent vs. quality vs. reach, lead vs. lead_state, etc.)
- [docs/api-patterns.md](../docs/api-patterns.md) — how actions/routes are shaped here
- [docs/coding-standards.md](../docs/coding-standards.md) — layering, naming, Next 16 gotchas
- The specific existing code adjacent to the feature (e.g. adding a lead filter → read
  `application/leads/filters.schema.ts` + `lead-queries.ts` + `lead-filter-bar.tsx`
  fully, don't guess the pattern)

## Step-by-step

1. **Locate the layer.** Decide which of `domain/` / `application/` / `infrastructure/`
   / `features/` the new logic belongs in, using the dependency rule (domain → nothing,
   application → domain + infra ports, features → application only). If it's pure logic
   with no I/O, it's `domain/` and needs a test.
2. **Check for an existing extension point first.** A new upstream source is a new
   `SourceConnector` adapter, not a branch in `sync-dataset.ts`. A new alert condition
   is a new `Predicate` composition, not a new column. A new notification channel is a
   new `Notifier` adapter. Prefer extending an existing seam over inventing a new one.
3. **Schema changes** (if any): edit `infrastructure/db/schema/*.ts`, then
   `npm run db:generate` to produce the migration. Never hand-write migration SQL. Add
   the inferred row type export (`export type XRow = typeof x.$inferSelect`) next to the
   table, matching existing files.
4. **Domain logic**: pure functions, no `db()`/`fetch`/`"server-only"`. Write the unit
   test in the same pass — see [docs/testing-strategy.md](../docs/testing-strategy.md)
   for what's worth testing here.
5. **Application layer**: Zod-validated server action via `authActionClient` /
   `adminActionClient` (never a raw untyped action), or a query function following the
   existing `lead-queries.ts` shape. Write a `lead_events` row if the change is
   audit-worthy. Invalidate the correct cache tags via `application/cache-tags.ts`
   helpers — `updateTag` for actions the actor must see reflected immediately,
   `revalidateTag(tag, "max")` for background cron/webhook refreshes.
6. **UI**: feature-scoped component in `features/<name>/components/`, built from
   `components/ui/` primitives and `components/common/` composables. Client components
   call the server action directly and `router.refresh()` — don't hand-roll optimistic
   state unless the existing pattern already does.
7. **Verify**: `npm run typecheck && npm run lint && npm test`. If UI changed, run the
   dev server and exercise it in a browser (golden path + at least one edge case).

## Expected output format

A short summary (not a full report) covering:
- What layer(s) changed and why
- Any new DB migration generated
- Test coverage added (file + what it pins down)
- Anything intentionally *not* done (scope you deliberately excluded) and why

## Example

**Task**: "Add a filter for minimum bedroom count to the lead inbox."

- `application/leads/filters.schema.ts`: add `minBedrooms: z.coerce.number().int().min(0).optional()`
  to `leadFiltersSchema`.
- `application/leads/lead-queries.ts`: add a `gte(schema.leads.bedrooms, filters.minBedrooms)`
  condition in `buildConditions`, following the existing `minIntent`/`minQuality` pattern.
- `features/leads/components/lead-filter-bar.tsx`: add the control, following the
  existing numeric-filter pattern in that file.
- No schema migration needed — `bedrooms` already exists on `leads`.
- No new test needed in `domain/` (this is a straightforward query-condition addition,
  not new logic) — covered adequately by existing manual verification of the filter bar.
