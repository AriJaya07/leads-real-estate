# Multi-Tenant Apify Isolation Plan

Answers: how does data pulled through one shared Apify account get tagged, validated,
and routed to the *correct* company, with zero cross-tenant mixing, while the platform
owner still gets a cross-company usage view. **Mixed state, not all planning anymore**
— §2 (the collision guard) and §3 (the Super Admin portal) are built and tested; §1
(auto-derived `namePatterns`) is still design-only. Each section says which.

## 0. Ground truth this plan is built on

- **One Apify account serves every company.** `APIFY_API_TOKEN` is a single process-wide
  env var (`shared/config/env.ts`); `infrastructure/apify/apify.connector.ts` reads it
  directly. Every company's `sources` row of `kind: "apify"` talks to the *same* Apify
  account. This is true today even though the rest of the stack
  (`docs/saas-platform-architecture.md`) is fully multi-tenant at the DB/app layer.
- **The only isolation mechanism that exists today is a per-source allowlist filter**
  — `sources.config.{namePatterns, producerIds, minItemCount}`, checked by
  `matchesFilters()` in `application/sync/discovery.ts`. It's an *allowlist*, not a
  *mutual-exclusivity guarantee* — nothing stops two companies' filters from both
  matching the same upstream dataset.
- **`datasets` is unique on `(sourceId, externalId)`, not on `externalId` alone**
  (`infrastructure/db/schema/catalog.ts`). If two companies' sources both discover the
  same Apify dataset id, Postgres happily creates two separate `datasets` rows — each
  syncs independently, each ingests the same scraped items into that company's own
  `raw_records`/`leads`. **This was a real cross-tenant leak/duplication path, not a
  hypothetical — now closed by §2's collision guard**, built and tested
  (`application/sync/discovery.integration.test.ts`).
- **`companies.slug`** already exists (`infrastructure/db/schema/company.ts`), unique,
  and its own doc comment says it's meant for exactly this kind of external-system
  identifier ("for future subdomain routing"). Reusable as the tenant key for Apify
  dataset naming — no schema change needed to get one.
- **Apify usage is already tracked per company.** `application/billing/usage.ts`
  increments `apify_requests_month` per company on every Apify call
  (`incrementApifyRequestUsage`), enforced against `plans.maxApifyRequestsPerMonth`.
  The data for "how much is each tenant using" already exists in `usage_counters` —
  what's missing is a view that shows it *across* companies at once.
- **The 4-tier role hierarchy is entirely per-company, and stays that way.**
  (`domain/auth/permissions.ts`: `owner > admin > manager > member`) — an `owner` sees
  their own company's data, full stop. "I as owner want to see all tenants' usage"
  isn't the company-level `owner` role scoped up; it's `users.isPlatformAdmin`, a
  separate, orthogonal, cross-company flag — see §3, built.

---

## 1. The core design decision: how a dataset proves which tenant it belongs to — design only, not built

Three options, in order of how much they cost to build. Recommendation: **A now, B as
reinforcement, C only if a customer's contract demands dedicated infrastructure.**

### Option A — Naming convention keyed on `companies.slug` (recommended, build first)

Every dataset pushed into Apify carries the owning company's slug in its name, and each
company's `sources.config.namePatterns` is a prefix match on that slug. Cheapest to
build (no schema change, no per-tenant Apify account), and it's the existing
`namePatterns` mechanism used *correctly* instead of left empty.

Convention: `averonai-{companySlug}-{sourceLabel}`, e.g.
`averonai-bukit-villa-partners-fb-groups`, `averonai-bukit-villa-partners-ig-likers`.

- **`namePatterns` becomes non-optional and auto-derived**, not admin-typed free text.
  When a company connects a source at `/admin/collection`, the app computes
  `averonai-{companies.slug}-` from the session's own `companyId` and either (a) sets
  it as the source's `namePatterns` automatically, or (b) shows it to the admin as
  "name every dataset you push starting with this exact prefix" — copyable, not
  retyped. Removes the human-typo failure mode entirely.
- **This is a contract with whoever configures n8n**, not something n8n discovers on
  its own — the n8n scraping workflow (the "producer role" in
  `docs/n8n-integration-plan.md` §12) must name the Apify dataset it creates using this
  exact prefix. Put the prefix in the same place the Apify token/actor config lives for
  that company's n8n setup, so it's one lookup, not tribal knowledge.

### Option B — `producerIds` (actor id) as a second, independent signal

`RemoteDataset.producerId` (Apify's own `actId`) is already captured today
(`infrastructure/apify/apify.connector.ts::toRemoteDataset`) but the seeded source
leaves `producerIds: []` (unused). If each company gets its **own dedicated Apify
Actor/Task** per scraper type (same Apify account, different actor), `producerIds`
becomes a second, Apify-assigned (not string-convention-based) tenant signal —
stronger than a name prefix alone, because it can't be typo'd or spoofed by whoever
names a dataset. Combine with A: `matchesFilters()` already ANDs both when both are
set — use that.

Costs real Apify-side setup (one actor/task per company per scraper), so: recommended
for Business/Enterprise-tier companies where isolation matters more, optional for
Starter — a decision the plan-limits table (`plans` table, already JSON-open via
`features`) can gate later, not a v1 requirement for every tenant.

### Option C — Dedicated Apify account per tenant (future, enterprise-only)

Same "dedicated" tier concept `saas-platform-architecture.md` already reserves for
database-per-tenant. Requires a real code change: `sources` (or a new
`source_credentials` table) carries a **per-company Apify token**, and
`getConnector()`/the Apify adapter accept a token per call instead of reading
`serverEnv().APIFY_API_TOKEN` unconditionally. Not v1 — flag as a decision to make
explicitly if/when a customer's compliance requirements demand it, per this codebase's
existing "don't build for a need that hasn't shown up yet" discipline.

---

## 2. Closing the actual leak path: a cross-company collision guard — built

Naming conventions reduce *accidental* overlap; they don't make it structurally
impossible, and admin-typed `namePatterns` can still be sloppy (e.g. an admin leaves it
empty like today's seeded row, or two prefixes accidentally overlap). The **hard
guarantee** needs a check at the one place all companies' discovery converges:
`discoverDatasets(sourceId)` in `application/sync/discovery.ts`.

**The validation rule, built:** before registering a newly-discovered `RemoteDataset`
under company A's source, check whether that `externalId` already exists in `datasets`
under a **different** `companyId`. Concretely (and this is what the shipped code does):

```
for each candidate dataset matched by matchesFilters():
  existing = SELECT companyId FROM datasets WHERE externalId = candidate.externalId
             (across ALL companies, not scoped to this source — the one deliberate
             cross-tenant read in this whole codebase, and it must stay read-only,
             comparison-only, never returning the other company's data itself)
  if existing.length > 0 AND existing.companyId != thisSource.companyId:
    do NOT register it under this company
    log a loud warning (structured, `scope: "discovery:cross-tenant-collision"`) with
    both companyIds, the externalId, and both sources' namePatterns — this needs a
    human to look at, it means two companies' filters overlap
    surface it in /admin/sync's health feed, not just a log line, so it doesn't get
    missed
  else:
    register normally (today's existing behavior)
```

This is the actual defense-in-depth layer — same "belt and suspenders" posture
`saas-platform-architecture.md` §5 already uses for RLS-plus-app-filters. Naming
convention (§1) is what *prevents* the collision from happening in the normal case;
this check is what *catches it loudly* the one time it doesn't, instead of silently
duplicating a lead across two paying customers.

**Why not just make `datasets.externalId` globally unique instead?** Considered and
rejected: a global unique index would make the collision a hard *database error* the
moment it happens, rather than a caught-and-logged skip — turns a recoverable admin
alert into a discovery-run failure for *both* companies simultaneously (a shared
`UNIQUE` violation on one row aborts the transaction touching it). The app-level check
above degrades the same way this codebase's other adapters do — log and skip, don't
crash the batch (`docs/api-patterns.md`'s error-handling conventions).

---

## 3. Platform-owner cross-tenant usage view — built

What this section originally proposed is now built, as the minimal version described
below (not yet promoted to the multi-person table variant — still fine for a
single-operator case, revisit if a support team needs this).

**A boolean flag, not a new role.** `users.isPlatformAdmin boolean default false`,
settable only by direct DB edit — not through any in-app UI, since this is
you-the-operator, not a tenant-facing feature. `application/auth/current-user.ts::requirePlatformAdmin()`
is the guard; `platformActionClient` (`application/safe-action.ts`) is its server-action
counterpart for the two writes below.

**Five pages under `/platform/*`** (`app/(platform)/`, its own dark-shelled
`PlatformShell` — deliberately unmistakable from the tenant app's light sidebar, no
link to any of this from inside the tenant app; a platform admin reaches it by typing
the URL, or via the "Super Admin dashboard" item in their own account menu):

- **`/platform/tenants`** (`application/platform/tenants.queries.ts`) — the usage
  table this section originally proposed, plus stat tiles (active tenants, tenants
  with a sync issue, trials ending within 7 days) and each tenant's category
  (`docs/domain.md`'s "Company category").
- **`/platform/category-templates`** — tenant adoption vs. registered Apify actor
  templates per vertical (`domain/verticals/catalog.ts`), flags categories with
  tenants but no matching template.
- **`/platform/analytics`** — platform-wide totals (leads/Apify requests this vs.
  last month, tenants by status) — sums of the same per-company `usage_counters`
  rows, never a `leads` row.
- **`/platform/connectors`** — every non-healthy dataset across every tenant,
  metadata only (name, health, company, last-synced) — the cross-tenant version of
  `/admin/sync`'s per-company health view.
- **`/platform/billing`** — plan distribution and estimated MRR from `plans`/`subscriptions`.

All five read **only** usage/health/billing metadata — never `leads`/`lead_appearances`/
`raw_records`, the same boundary this section's original SQL sketch already committed
to. Keep it that way: platform-level visibility into *usage numbers*, never a "browse
another company's actual leads" surface — that would defeat the entire tenant isolation
model documented in §5 of `saas-platform-architecture.md`.

**Tenant drill-in (`/platform/tenants/[companyId]`) — the one place the two shells
overlap, on purpose, unmissably.** Clicking a tenant row opens a read-only view of that
tenant framed by a persistent amber banner ("Viewing X as Super Admin — read only") and
exactly two enabled actions — `application/platform/tenant-actions.ts`:

- `extendTenantTrial` — pushes `trialEndsAt` forward (only callable on a `trialing`
  company).
- `resendTenantInvite` — reissues a pending invite's token and re-sends the email.

Both are `platformActionClient`-gated and **both write to `super_admin_actions`**
(`infrastructure/db/schema/platform.ts`) — an append-only audit log, one row per
action, never edited or deleted, visible on the drill-in page itself so a tenant owner
could be shown "did anyone touch my account" and get a real answer. This is the closed
set — adding a third capability means adding a third `superAdminActionEnum` value and a
third function, not loosening what either of these already does. Neither action ever
touches a lead, a dataset, or a rule.

**If more than one or two people need this** (a support team, not just you): promote
`isPlatformAdmin` to a proper separate table (`platform_admins`, one row per person,
audit-logged grant/revoke) rather than a column anyone with DB access could quietly
flip. Not needed for a single-operator case — the `super_admin_actions` log above
already gives per-action audit trail regardless of how many people hold the flag.

**Identifying which Apify dataset belongs to which tenant, visually, in the Apify
console itself**: this is what §1's naming convention already gives you for free — every
dataset name in the Apify dashboard literally starts with the company's slug. No
separate tagging system needed; Apify's own dataset list becomes self-documenting once
the convention is followed. (Apify datasets also support key-value tags/metadata via
their API if you want a belt-and-suspenders second signal beyond the name — optional,
the name prefix alone is sufficient for what you described.)

---

## 4. Step-by-step: what you actually do, in order

1. **Confirm every company that will use Apify has a slug you're happy exposing** in
   dataset names (`companies.slug` — already set at signup, human-readable, e.g.
   `bukit-villa-partners`). Nothing to build here, just decide whether the existing
   slugs are the identifier you want visible in Apify, or whether you'd rather use
   `companies.id` (opaque UUID, less readable but zero risk of ever colliding or
   leaking a competitor's company name into a dataset list a third party might see).
2. **Build the `namePatterns` auto-fill** at `/admin/collection`'s "connect a source"
   step (§1) — when a company's admin sets up an Apify source, the app shows/sets the
   exact prefix their n8n workflow must use.
3. **Update every n8n producer workflow** (the scraping side, `docs/n8n-integration-plan.md`
   §12) to name its target Apify dataset using that company's assigned prefix. This is
   a per-company n8n configuration step, not a one-time app change — every new company
   that connects a source needs its own n8n workflow (or workflow variable) pointed at
   its own prefix.
4. ~~**Build the cross-company collision guard** (§2) inside `discoverDatasets()`.~~
   **Done** — `application/sync/discovery.ts`, tested by
   `discovery.integration.test.ts`'s "cross-company collision guard" case.
5. **Backfill the existing seeded source's `namePatterns`** — still empty (matches
   everything). Still open — do this once step 2 (the auto-fill UI) exists, so it's
   set to a real prefix instead of typed by hand.
6. ~~**Build the platform usage view** (§3)~~ **Done** — `/platform/tenants` and four
   sibling pages, see §3.
7. **Verify with a second company** — create a second company via `/signup`, connect a
   second Apify-kind source with a deliberately *overlapping* `namePatterns` (to
   simulate a mistake), push a test item under both prefixes, run discovery, and
   confirm: each company only registers its own dataset, and the collision guard logs
   the deliberate overlap you introduced instead of silently double-registering.

---

## 5. What NOT to do

- **Don't rely on `producerIds`/`namePatterns` alone without §2's guard.** A filter is
  an allowlist an admin can misconfigure; the guard is what makes misconfiguration loud
  instead of silent.
- **Don't give the platform view access to raw leads.** Usage counts only (§3) — the
  moment a "see everything" surface can list another company's actual leads, the tenant
  isolation this whole platform is built on (`saas-platform-architecture.md` §5) is
  compromised for real, not just in theory.
- **Don't build per-tenant Apify accounts (Option C) speculatively.** It's a real cost
  (account provisioning, token rotation per tenant, more moving parts) for isolation
  strength you likely don't need yet given §1+§2 already close the actual leak path.
  Revisit only if a specific customer's contract requires dedicated infrastructure.

---

## 6. Verification checklist

- [ ] A brand-new company's `/admin/collection` "connect a source" step shows a
      specific, non-empty, auto-derived `namePatterns` prefix — never blank. **Not
      built** — sources are currently seeded (`infrastructure/db/seed.mjs`), there is
      no "connect a source" UI step yet that would need this auto-fill.
- [x] Two companies' sources with deliberately overlapping `namePatterns` — the second
      company's discovery run logs a `cross-tenant-collision` warning and does **not**
      create a `datasets` row for the already-claimed `externalId`. Built and tested —
      `application/sync/discovery.integration.test.ts`'s "cross-company collision
      guard" case.
- [ ] `/admin/sync`'s health feed surfaces that warning, not just a server log. Not
      verified either way — check before relying on it.
- [x] `/platform/tenants` shows every company's `apify_requests_month` side by side,
      reachable only by a user with `isPlatformAdmin = true`, redirects (not a 403 —
      see `requirePlatformAdmin()`'s own comment on why a redirect over a 403) to
      `/leads` for everyone else including a company `owner`. Built and tested —
      `e2e/platform-admin.spec.ts`.
- [x] The platform view's queries never `SELECT` from `leads`/`lead_appearances`/
      `raw_records` — true by construction across all five `application/platform/*.queries.ts`
      files (usage counters, dataset/subscription/invite metadata only).
