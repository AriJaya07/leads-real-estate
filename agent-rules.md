# Agent Rules

Project-specific rules for AI agents working in this repository. Read
[AGENTS.md](AGENTS.md) first (Next.js version notice), then the `/docs` set linked
below as needed. This file is the fast-reference layer — constraints and defaults, not
explanations. See [docs/architecture.md](docs/architecture.md) for the why behind most
of these.

## Before writing any Next.js route/caching/proxy code

Read `node_modules/next/dist/docs/` first. This project runs Next 16, which renamed
Middleware to Proxy (`proxy.ts`, not `middleware.ts`) and changed cache invalidation
APIs (`updateTag` vs `revalidateTag(tag, "max")`). Do not "fix" these back to older API
shapes from training data — see [docs/coding-standards.md](docs/coding-standards.md).

## Hard constraints

- **Never add an env var for operational config.** Which datasets sync, alert
  thresholds, recipients, intervals — all of that is database state edited from
  `/admin`. If a task seems to need a new env var for something other than a secret or
  deployment identity, that's a signal to model it as a DB row instead. See
  [docs/environment.md](docs/environment.md).
- **Never bypass `authActionClient`/`adminActionClient` for a mutation.** No direct
  `db()` calls from a `"use client"` component. No skipping `.inputSchema()` on a server
  action. See [docs/api-patterns.md](docs/api-patterns.md).
- **Never touch `lead_states` from the sync/reprocessing pipeline except via
  `onConflictDoNothing` on first creation.** Status, assignment, notes, tags,
  `firstContactedAt` are human-owned and must survive every reprocess, remap, and
  reclassification. If a change would overwrite an existing `lead_states` row from
  pipeline code, stop and reconsider — see [docs/domain.md](docs/domain.md).
- **Never mix `reach`/engagement into `intentScore` or `priorityScore`.** This was
  reverted from an earlier design on purpose. Keep them as separate fields/axes.
- **Never rely on the shared `(app)` layout as a protected page's only auth check.**
  Every page calls `requireUser()`/`requireAdmin()` itself. Next layouts don't re-run on
  client-side navigation between siblings, so a layout-only check is unreliable past the
  first hard load — see [docs/architecture.md](docs/architecture.md)'s Auth model.
- **Never use `DropdownMenuLabel` outside a `DropdownMenuGroup`.** Base UI's
  `Menu.GroupLabel` throws at open time, not build time, if it isn't wrapped in
  `Menu.Group` — this broke a production dropdown silently. Open any new dropdown menu
  in a real browser before considering it done.
- **Never compare secrets with `===`.** Use `secretsMatch()`
  (`application/http/verify-secret.ts`) for cron/webhook secrets, the existing
  `verifyPassword`/`timingSafeEqual` path for passwords. Constant-time everywhere a
  shared secret or hash is checked.
- **Never interpolate a raw JS array into a Drizzle `sql` template.** Use `textArray()`
  from `application/leads/sql-helpers.ts`. Never build SQL text from a user-controlled
  string — bind it as a parameter, even inside a `jsonb ->> key` lookup.
- **Never let ingestion abort on one bad record.** Batch processing
  (`processRawRecords`, `syncDataset`) must catch per-item and keep going; one malformed
  upstream payload must not fail an entire sync run.
- **Never delete a raw record, a lead, or a duplicate lead.** Duplicates are linked via
  `canonicalLeadId`, missing upstream datasets are flagged `status = "missing"`, nothing
  in the ingestion path does a hard delete. If a task seems to call for deleting data,
  ask first.
- **Never let a `/platform/*` (Super Admin) query `SELECT` from `leads`/`lead_appearances`/
  `raw_records`.** Usage/health/billing metadata only — a cross-company view of actual
  lead data defeats the tenant isolation the whole platform is built on. Never add a
  third Super Admin write capability without a new `superAdminActionEnum` value and a
  `super_admin_actions` log entry — see [docs/multi-tenant-apify-isolation-plan.md](docs/multi-tenant-apify-isolation-plan.md)
  §3.
- **Never make `isPlatformAdmin` grantable from any in-app UI or server action.**
  Direct database edit only — same reasoning as not letting a company mint its own
  owner from a public form. If a task seems to need an in-app way to grant it, ask
  first.
- **Never route the `email` notifier channel through anything but `emailNotifier`
  (direct Resend).** It's shared with password-reset and team-invite sends
  (`application/auth/password-reset.actions.ts`, `application/auth/invite.actions.ts`),
  which must not depend on an external automation tool being reachable. `whatsapp`/
  `slack` relay through n8n; `email` does not — see
  [infrastructure/notifiers/registry.ts](infrastructure/notifiers/registry.ts).

## Defaults / preferred approach

- New upstream source → new `infrastructure/` adapter implementing `SourceConnector`,
  registered in `infrastructure/connectors/registry.ts`. New notification channel →
  same pattern via `infrastructure/notifiers/registry.ts`. Don't special-case a vendor
  inside `application/sync/sync-dataset.ts` or `application/alerting/dispatch.ts`.
- New `features/<name>/` folder should pair 1:1 with an `application/<name>/` folder
  where one exists — don't drop unrelated UI into an existing feature folder as a
  catch-all. See [docs/coding-standards.md](docs/coding-standards.md).
- A pattern duplicated across two or more client components → pull it into `hooks/`
  (see `useUrlFilters`, `useServerAction`) rather than leaving each component with its
  own copy.
- Logging outside the sync pipeline → `createLogger()` from
  `infrastructure/observability/logger.ts`, not a bare `console.*` call.
- Anything in `domain/` should stay pure (no `db()`, no `fetch`, no `import "server-only"`)
  and get a unit test alongside any behavior change. See
  [docs/testing-strategy.md](docs/testing-strategy.md).
- Prefer extending the existing predicate language (`domain/alerting/predicate.ts`) over
  adding a new bespoke condition type for alert rules — it's deliberately small and
  closed (no arbitrary expressions) as a security property, not an oversight.
- When a change touches scoring weights, mapping synonyms, or an intent lexicon, treat
  it as tuning a live production signal, not a code refactor — check the relevant
  lexicon file's existing weight scale (roughly 10–45 across `domain/scoring/lexicon.ts`
  (real estate, the default) and `domain/scoring/lexicons/{travel,courses}.ts`) and
  keep new entries consistent with it, and prefer adding a test that pins the
  before/after classification of a representative real-world phrase.
- Adding a new company category (beyond real estate/travel/courses/other) touches, in
  order: `domain/verticals/catalog.ts` (the `CompanyCategory` union + `VERTICALS`
  entry), `infrastructure/db/schema/enums.ts::companyCategoryEnum` (duplicate the same
  literal values — same split as `Role`/`userRoleEnum`), a migration, a new
  `domain/scoring/lexicons/<category>.ts` + a case in
  `domain/scoring/lexicon-registry.ts`, and every `z.enum([...])` literal duplicating
  the category list in a server action's input schema (`application/auth/signup.actions.ts`,
  `application/collection/actor-templates.actions.ts`). Grep for `"real_estate"` to find
  every place the list is duplicated before adding a fifth.
- Match the existing comment style: comments explain *why*, often citing a specific
  past bug or production incident, never restate *what* the code does. See
  [docs/coding-standards.md](docs/coding-standards.md).

## Before finishing a task

- `npm run typecheck && npm run lint && npm test` — the pre-commit hook runs `npm test`
  regardless, but check all three before calling something done.
- If you touched anything that writes raw SQL (a new Drizzle `sql` template, a changed
  query), a passing unit test is not enough — it can compile a query without ever
  executing it against Postgres. Run `npm run test:integration` too. See
  [docs/tech-debt.md](docs/tech-debt.md) for the exact bug this caught once already.
- If you touched `infrastructure/db/schema/*`, run `npm run db:generate` to produce the
  migration — do not hand-write migration SQL. Apply it to `averonai_test`/`averonai_e2e`
  too (`npm run db:migrate:test` / `node --env-file=.env.e2e infrastructure/db/migrate.mjs`)
  before running those suites, or they'll fail against a stale schema.
- If you touched UI, run the dev server and check the change in a browser (see the
  `run` skill), and if it's on a path already covered by `e2e/*.spec.ts`, run
  `npm run build && npm run test:e2e` — don't rely on typecheck/lint alone.
- If you changed a domain-layer scoring/mapping/ranking function, confirm its unit
  tests still describe the new behavior accurately — a passing test that now asserts
  the wrong thing is worse than a failing one.

## Reference

- [docs/architecture.md](docs/architecture.md) — system design, data flow, key decisions
- [docs/domain.md](docs/domain.md) — glossary, entity relationships, business rules
- [docs/coding-standards.md](docs/coding-standards.md) — style, layering, patterns
- [docs/api-patterns.md](docs/api-patterns.md) — server actions, route handlers, errors
- [docs/prd.md](docs/prd.md) — what this product is for, roadmap, non-goals
- [docs/tech-debt.md](docs/tech-debt.md) — known sharp edges, don't be surprised by them
- [docs/testing-strategy.md](docs/testing-strategy.md) — what/how to test
- [docs/environment.md](docs/environment.md) — env vars, setup, third-party services
- [docs/n8n-integration-plan.md](docs/n8n-integration-plan.md) — why the n8n workflows in
  `n8n/workflows/` are shaped the way they are
- [docs/multi-tenant-apify-isolation-plan.md](docs/multi-tenant-apify-isolation-plan.md) —
  tenant isolation design, the Super Admin portal, and what it's never allowed to touch
- [docs/lead-source-scaling-plan.md](docs/lead-source-scaling-plan.md) — why `recordKind`
  exists and what breaks if you skip it when adding a new content shape
- [ai-prompts/](ai-prompts/) — task-shaped prompt templates (feature work, bug fixes,
  reviews, refactoring, tests, docs)
