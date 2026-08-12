import { type AnyPgColumn, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { categoryConfigStatusEnum } from "./enums";
import type { VerticalFieldLabels } from "@/domain/verticals/catalog";

/**
 * A business vertical — fully dynamic, Super-Admin-created, no code or
 * migration required (see `docs/platform-super-admin-flow.md` §3, revised).
 * `slug` is the stable identifier used in URLs and (historically) would have
 * been an enum literal; it is plain text now precisely so a new one doesn't
 * need a schema change. `companies.categoryId` and `actor_templates.categoryId`
 * both reference this table.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    /** Same shape rendered by `FieldLabelsProvider` — "Property types" vs. "Trip interests" etc. */
    fieldLabels: jsonb("field_labels").$type<VerticalFieldLabels>().notNull(),
    status: categoryConfigStatusEnum("status").notNull().default("active"),
    /** `{ categoryFieldOptions: string[], locationOptions: string[] }` — suggested filter/autocomplete values only, never enforced against the underlying free-text columns. */
    filterPresets: jsonb("filter_presets")
      .$type<{ categoryFieldOptions: string[]; locationOptions: string[] }>()
      .notNull()
      .default({ categoryFieldOptions: [], locationOptions: [] }),
    /** Super Admin-only — never rendered anywhere a tenant session can reach. */
    internalNotes: text("internal_notes"),
    createdByUserId: uuid("created_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    updatedByUserId: uuid("updated_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_slug_key").on(t.slug)],
);

export const lexiconIntentEnum = pgEnum("lexicon_intent", ["buyer", "seller", "agent", "investor", "broker"]);

/**
 * A category's intent-phrase lexicon — replaces the hand-authored
 * `domain/scoring/lexicons/*.ts` files as the runtime source of truth
 * (those files now only seed the four original categories' starting data,
 * see `infrastructure/db/backfill-categories.mjs`). Read once per sync
 * batch, not per record — `application/categories/lexicon.queries.ts`. Same
 * weight scale the old static files used (roughly 10-45), enforced at the
 * action layer, not the DB — see `application/categories/categories.actions.ts`.
 */
export const categoryLexiconPhrases = pgTable(
  "category_lexicon_phrases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    intent: lexiconIntentEnum("intent").notNull(),
    phrase: text("phrase").notNull(),
    weight: integer("weight").notNull(),
    lang: text("lang").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("category_lexicon_phrases_unique").on(t.categoryId, t.intent, t.phrase, t.lang),
    index("category_lexicon_phrases_category_idx").on(t.categoryId, t.intent),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
export type CategoryLexiconPhraseRow = typeof categoryLexiconPhrases.$inferSelect;
