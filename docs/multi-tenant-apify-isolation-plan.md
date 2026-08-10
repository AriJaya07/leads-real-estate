# Multi-Tenant Apify Isolation Plan

Planning only — nothing here is implemented. Answers: how does data pulled through one
shared Apify account get tagged, validated, and routed to the *correct* company, with
zero cross-tenant mixing, while the platform owner still gets a cross-company usage view.

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
  `raw_records`/`leads`. **This is a real cross-tenant leak/duplication path, not a
  hypothetical** — it just hasn't been hit yet because only one company's source
  exists in the seeded data.
- **`companies.slug`** already exists (`infrastructure/db/schema/company.ts`), unique,
  and its own doc comment says it's meant for exactly this kind of external-system
  identifier ("for future subdomain routing"). Reusable as the tenant key for Apify
  dataset naming — no schema change needed to get one.
- **Apify usage is already tracked per company.** `application/billing/usage.ts`
  increments `apify_requests_month` per company on every Apify call
  (`incrementApifyRequestUsage`), enforced against `plans.maxApifyRequestsPerMonth`.
  The data for "how much is each tenant using" already exists in `usage_counters` —
  what's missing is a view that shows it *across* companies at once.
- **No platform/superadmin role exists.** The 4-tier role hierarchy
  (`domain/auth/permissions.ts`: `owner > admin > manager > member`) is entirely
  per-company — an `owner` sees their own company's data, full stop. "I as owner want
  to see all tenants' usage" describes a role that doesn't exist yet in this codebase;
  it is not the company-level `owner` role, which is intentionally scoped.

---

## 1. The core design decision: how a dataset proves which tenant it belongs to

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

## 2. Closing the actual leak path: a cross-company collision guard

Naming conventions reduce *accidental* overlap; they don't make it structurally
impossible, and admin-typed `namePatterns` can still be sloppy (e.g. an admin leaves it
empty like today's seeded row, or two prefixes accidentally overlap). The **hard
guarantee** needs a check at the one place all companies' discovery converges:
`discoverDatasets(sourceId)` in `application/sync/discovery.ts`.

**New validation rule to add** (not yet built): before registering a newly-discovered
`RemoteDataset` under company A's source, check whether that `externalId` already
exists in `datasets` under a **different** `companyId`. Concretely:

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

## 3. Platform-owner cross-tenant usage view (new concept, doesn't exist today)

What you're describing — "I as owner want to see how much each tenant/company uses" —
needs a role that isn't in the schema yet. The per-company `owner` role is deliberately
scoped to one company; don't overload it. Two ways to add this, pick based on how many
people need this view:

**Minimal (recommended to start): a boolean flag, not a new role.**
`users.isPlatformAdmin boolean default false`, settable only by direct DB edit (or a
one-off script) — not through any in-app UI, since this is you-the-operator, not a
tenant-facing feature. A new route, `/platform/usage` (outside the `(app)` layout's
per-company assumptions, its own `requirePlatformAdmin()` guard), reads:

```sql
SELECT c.id, c.name, c.slug, c.status,
       uc_apify.value AS apify_requests_this_month,
       uc_leads.value AS leads_this_month,
       (SELECT count(*) FROM datasets d WHERE d.company_id = c.id) AS dataset_count
FROM companies c
LEFT JOIN usage_counters uc_apify ON uc_apify.company_id = c.id
  AND uc_apify.metric = 'apify_requests_month' AND uc_apify.period = date_trunc('month', now())
LEFT JOIN usage_counters uc_leads ON uc_leads.company_id = c.id
  AND uc_leads.metric = 'leads_month' AND uc_leads.period = date_trunc('month', now())
ORDER BY apify_requests_this_month DESC NULLS LAST;
```

This is a **read-only aggregate over already-existing per-company data** — it does not
require touching `leads`/`raw_records` cross-tenant, it reads the counters that already
exist. Keep it that way: platform-level visibility into *usage numbers*, never a
"browse another company's actual leads" surface — that would defeat the entire tenant
isolation model documented in §5 of `saas-platform-architecture.md`.

**If more than one or two people need this** (a support team, not just you): promote
`isPlatformAdmin` to a proper separate table (`platform_admins`, one row per person,
audit-logged grant/revoke) rather than a column anyone with DB access could quietly
flip. Not needed for a single-operator case — start minimal.

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
4. **Build the cross-company collision guard** (§2) inside `discoverDatasets()`. This
   is the one piece that's a real code change, not just configuration — do it before
   onboarding a second company with its own Apify-kind source, not after.
5. **Backfill the existing seeded source's `namePatterns`** — it's currently empty
   (matches everything). Set it to that company's real prefix once §2's naming
   convention exists, so the one company already in the system also benefits from the
   isolation instead of being the one row that still matches anything.
6. **Build the platform usage view** (§3) — independent of 1–5, can happen in parallel.
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

## 6. Verification checklist (once built)

- [ ] A brand-new company's `/admin/collection` "connect a source" step shows a
      specific, non-empty, auto-derived `namePatterns` prefix — never blank.
- [ ] Two companies' sources with deliberately overlapping `namePatterns` — the second
      company's discovery run logs a `cross-tenant-collision` warning and does **not**
      create a `datasets` row for the already-claimed `externalId`.
- [ ] `/admin/sync`'s health feed surfaces that warning, not just a server log.
- [ ] `/platform/usage` (or whatever route name is chosen) shows every company's
      `apify_requests_month` side by side, reachable only by a user with
      `isPlatformAdmin = true`, 403s for everyone else including a company `owner`.
- [ ] The platform view's queries never `SELECT` from `leads`/`lead_appearances`/
      `raw_records` — grep the route's implementation for this before shipping it.
