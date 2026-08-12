# Super Admin Platform — Page Flow & Category Management Design

Answers two things: (1) how every `/platform/*` page connects to the others, what it
shows, and what a Super Admin can *do* on it; (2) the end-to-end flow for adding and
configuring a business category (Real Estate, Travel, Courses, and future verticals),
including fields, filters, and data-source requirements — without weakening the tenant
privacy boundary `docs/multi-tenant-apify-isolation-plan.md` §3 already established.

**Status:** built. §1–§2 describe what already existed before this doc
(`/platform/tenants`, `/platform/analytics`, `/platform/connectors`,
`/platform/billing`) and are unchanged. §3 is the new surface this doc adds:
`/platform/categories`, fully dynamic (revised after the initial two-layer design was
deliberately reopened — see §3.0's "revision history" note).

---

## 0. Ground rules (unchanged, load-bearing for everything below)

- **`users.isPlatformAdmin`** is the only gate. Not a role tier, not grantable from any
  in-app UI — direct DB edit only. `requirePlatformAdmin()` redirects everyone else to
  `/leads`, including a company `owner`.
- **`/platform/*` never reads `leads` / `lead_appearances` / `raw_records`.** Every page
  below reads usage counters, dataset/subscription/invite *metadata*, and company rows —
  never a tenant's actual scraped data. This is re-stated per page below because it's
  the one rule that must never regress as new platform pages get added.
- **The Super Admin shell (`PlatformShell`) is unmistakably not the tenant app.** Dark,
  hardcoded chrome, no link to it from inside `(app)`. A platform admin reaches it by
  typing the URL or via their account menu.
- **Every write a Super Admin makes is a named, logged, reversible action** — never a
  generic "edit this row" form. Two audit logs exist, kept deliberately separate because
  they log different kinds of things:
  - `super_admin_actions` — writes against a *specific tenant* (`extend_trial`,
    `resend_invite`). Company-scoped, shown on that tenant's drill-in page.
  - `platform_category_actions` (new, §3) — writes against *platform configuration*
    (`create_category`, `update_config`, `update_lexicon`). Not company-scoped, shown
    on the category's own page.

---

## 1. Sitemap

```
/platform/tenants ───────────┬──> /platform/tenants/[companyId]   (drill-in, 2 actions)
                              │
/platform/categories ────────┴──> /platform/categories/[slug]     (config + lexicon edit,
                                                                     "New category" creates
                                                                     instantly, no drill queue)
/platform/analytics           (read-only, no drill-in)
/platform/connectors          (read-only, no drill-in)
/platform/billing             (read-only, no drill-in)
```

Every page shares the same left nav (`PlatformShell`) and the same "Back to your
workspace" exit at the bottom — there is no other cross-linking between the five nav
items themselves; each is a self-contained view of one slice of platform state. The
only two-level drill-ins are tenants (existing) and categories (new, this doc).

---

## 2. Existing pages (unchanged — restated for completeness)

### `/platform/tenants`
- **Shows:** stat tiles (active tenants, tenants with a sync issue, trials ending ≤7d)
  + a table of every company (name, slug, category, status, Apify requests this month,
  leads-this-month *count* only, dataset count, health).
- **Actions:** none on this page itself — click a row to drill in.
- **Connects to:** `/platform/tenants/[companyId]`.

### `/platform/tenants/[companyId]`
- **Shows:** an amber "Viewing X as Super Admin — read only" banner (unmissable,
  intentional), tenant stat tiles (seats, leads this month, datasets), pending invites,
  and that tenant's slice of `super_admin_actions`.
- **Actions:** exactly two — `Extend trial` (only if `status = trialing`) and
  `Resend invite` (per pending invite). Both write to `super_admin_actions`.
- **Connects to:** back to `/platform/tenants` via the banner's "Exit to platform" link.

### `/platform/analytics`
- **Shows:** platform-wide totals — leads/Apify requests this vs. last month, tenants by
  status. Sums of `usage_counters`, never a `leads` row.
- **Actions:** none. Pure read-only dashboard.

### `/platform/connectors`
- **Shows:** every non-healthy dataset across every tenant — name, health, company,
  last-synced. The cross-tenant version of a single company's `/admin/sync` health view.
- **Actions:** none. A platform admin who spots a stuck sync goes fix it inside that
  tenant's own `/admin/sync` (out of `/platform/*` scope entirely — no shortcut button
  here on purpose, so a Super Admin is never one click from touching a tenant's sync
  config).

### `/platform/billing`
- **Shows:** plan distribution, estimated MRR from `plans`/`subscriptions`.
- **Actions:** none.

---

## 3. New: Category management (`/platform/categories`)

### 3.0 The core design decision: fully dynamic, no code gate

**Revision history:** this section originally specced a two-layer split — category
*type* frozen as a code + migration change (compile-time union, hand-reviewed lexicon
files), category *config* (status/filter presets) alone Super-Admin-editable. That
version shipped first. It was then **deliberately reopened and replaced** by the fully
dynamic design below — a conscious tradeoff, not a reversal by accident: it gives up the
code-review gate on new categories and on lexicon weights, in exchange for a Super Admin
never blocking on an engineer to launch a new vertical. Read this if you're wondering
why `domain/verticals/catalog.ts` no longer has a `CompanyCategory` union — it was
removed on purpose.

A category (`categories` table, `infrastructure/db/schema/categories.ts`) is now one DB
row a Super Admin creates instantly at `/platform/categories` — label, slug, field
labels, filter presets, status — via `createCategory`
(`application/categories/categories.actions.ts`). No migration, no
`z.enum([...])` literal to update, no PR. `companies.categoryId` and
`actor_templates.categoryId` are plain FKs to this table.

The one thing this reopens deliberately: the intent-phrase **lexicon**
(`category_lexicon_phrases` table) is also Super-Admin-editable now, on a category's own
detail page — the hand-authored-file + code-review gate agent-rules.md used to describe
is gone for this table. The guardrail that's left is a bounded weight scale (5–50,
enforced in `categories.actions.ts`, matching the old files' documented 10–45 range) and
its own `update_lexicon` audit action — not a substitute for review, an accepted
tradeoff. A category with zero phrases falls back to the real-estate lexicon
(`getLexiconBundleForCategory`) rather than scoring everything as zero-intent, so a
freshly created category isn't silently broken before anyone tunes it — which is also
why creation defaults `status` to `beta`, not `active`: it's not offered at `/signup`
until a Super Admin has had a chance to add phrases and flip it over.

What's unchanged from the original two-layer thinking, and still true: the canonical
lead columns (`propertyTypes`, `locations`, budget) stay one shared shape across every
category — a category still only varies *labels* and *lexicon weights*, never invents a
new schema column. See `docs/domain.md`.

### 3.1 `/platform/categories` (overview)

- **Shows:** one row per category: label, description, tenant count, actor-template
  count, and **status** badge (`Active` / `Beta` / `Disabled`) — `getCategoryOverview()`
  (`application/categories/categories.queries.ts`).
- **Flags gaps loudly:** a row with tenants but zero actor templates gets a "tenants
  with no matching actor" inline warning. A row set to `Disabled` with any active
  tenants gets its own warning too (disabling a category a tenant is still using is a
  footgun worth surfacing, not blocking — an existing tenant is never forcibly
  migrated).
- **Actions:** `New category` — an inline form (same pattern as
  `ActorTemplateManager`'s "Register actor," expands in place) collecting label, slug,
  description, and the six `VerticalFieldLabels` fields. Submits to `createCategory`,
  created as `beta`, then routes straight to the new category's detail page to add
  lexicon phrases.
- **Connects to:** `/platform/categories/[slug]` (row click or post-create redirect).

### 3.2 `/platform/categories/[slug]` (config + lexicon editor)

- **Shows:**
  - Header: category label + description (read-only here — see below).
  - Stat tiles: tenant count, active actor-template count.
  - **Config form** (`CategoryConfigForm`, `updateCategoryConfig`):
    - **Status** — `Active` (shown at `/signup`) / `Beta` (hidden from signup, usable by
      manually-created test tenants) / `Disabled` (hidden from signup; existing tenants
      keep working, this only stops *new* signups choosing it).
    - **Filter-value presets** — two comma-separated lists,
      `categories.filter_presets.categoryFieldOptions` and `.locationOptions`. Seed the
      autocomplete/quick-filter chips a tenant sees for the open-vocabulary
      `propertyTypes`/`locations` columns. Editing this never touches a tenant's
      already-tagged leads — suggested values only, same non-destructive posture as
      `namePatterns` in the Apify isolation plan.
    - **Internal notes** — free text, Super Admin-only, never shown to any tenant.
  - **Lexicon editor** (`LexiconPhraseEditor`) — phrases grouped by intent
    (buyer/seller/agent/investor/broker), each with weight and language, add/remove
    per-phrase via `addLexiconPhrase`/`removeLexiconPhrase`. This is the part that
    directly changes live scoring for every tenant on this category — see §3.0.
  - **Change log** — this category's slice of `platform_category_actions`
    (`create_category` / `update_config` / `update_lexicon`), who made each change,
    when.
  - Label/description are **not** editable here — re-create instead of renaming, since
    the label is user-facing copy baked into the signup picker and lead-detail field
    labels; changing it silently would be confusing mid-flight for existing tenants.
- **Connects to:** back to `/platform/categories`; no per-category tenant roster on
  this page — a Super Admin who wants to see *which* tenants use a category reads the
  category column on `/platform/tenants` instead, keeping this page metadata-only same
  as every other platform page.

### 3.3 Data model

```
categories                  -- one row per business vertical, Super-Admin-created
  id, slug (unique)          uuid, text
  label, description         text
  field_labels                jsonb  (VerticalFieldLabels shape)
  status                      'active' | 'beta' | 'disabled'
  filter_presets               jsonb { categoryFieldOptions: string[], locationOptions: string[] }
  internal_notes                text
  created_by_user_id, updated_by_user_id   uuid -> users, set null
  created_at, updated_at

category_lexicon_phrases    -- DB-driven intent lexicon, replaces the old static files
  id, category_id            uuid -> categories, cascade
  intent                      'buyer' | 'seller' | 'agent' | 'investor' | 'broker'
  phrase, weight, lang        text, integer (5-50), text ('en' | 'id')
  created_at

platform_category_actions   -- append-only audit log, category-config's equivalent
  id                         uuid                          -- of `super_admin_actions`
  platform_admin_user_id     uuid -> users, set null
  action                     'create_category' | 'update_config' | 'update_lexicon'
  category_id                uuid -> categories, set null, nullable
  details                    jsonb
  created_at
```

### 3.4 Permissions & privacy recap for this section specifically

- Every read/write here goes through `requirePlatformAdmin()` /
  `platformActionClient` — identical gate to every other `/platform/*` page.
  `listActiveCategories()` (the `/signup` picker's data source) is the one public,
  unauthenticated read — metadata only, same as any other marketing-page query.
- Nothing in `categories` / `category_lexicon_phrases` / `platform_category_actions`
  references a tenant's leads, datasets, or sources. `filter_presets` are *suggested
  values*, never a query against real tenant data.
- `internal_notes` is a Super Admin-only field, never rendered anywhere a tenant
  user's session can reach.
- Adding a fourth category-management capability beyond {create category, update
  config, update lexicon} means adding a fourth `platform_category_action` enum value,
  same closed-set discipline as `super_admin_action_enum`.

---

## 4. What this doc deliberately does not change

- No new `isPlatformAdmin`-granting UI — still direct DB edit only.
- No `/platform/*` page gains access to `leads`/`lead_appearances`/`raw_records`.
- No tenant is ever auto-migrated or force-changed when a category's status flips to
  `disabled` — `companies.categoryId` is immutable post-signup regardless of what
  `/platform/categories` says today (`docs/domain.md`: "Deliberately immutable
  post-signup").
- The canonical lead columns stay one shared shape across every category — a category
  varies labels and lexicon weights, never a new schema column (§3.0).
