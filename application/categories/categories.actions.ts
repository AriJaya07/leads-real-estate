"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { platformActionClient, ActionError } from "@/application/safe-action";

const filterOptionsSchema = z.array(z.string().trim().min(1).max(60)).max(30);

const fieldLabelsSchema = z.object({
  categoryField: z.string().trim().min(1).max(60),
  wants: z.string().trim().min(1).max(60),
  budget: z.string().trim().min(1).max(60),
  locations: z.string().trim().min(1).max(60),
  companyName: z.string().trim().min(1).max(60),
  companyNamePlaceholder: z.string().trim().min(1).max(60),
});

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase snake_case, e.g. "automotive" or "home_services".');

/** Same weight scale the hand-authored lexicon files used (agent-rules.md: "roughly 10-45") — a soft guardrail so a fat-fingered phrase can't silently dominate or vanish from scoring. */
const WEIGHT_MIN = 5;
const WEIGHT_MAX = 50;
const weightSchema = z.coerce.number().int().min(WEIGHT_MIN).max(WEIGHT_MAX);

const seedPhraseSchema = z.object({
  intent: z.enum(["buyer", "seller", "agent", "investor", "broker"]),
  phrase: z.string().trim().min(1).max(120),
  weight: weightSchema,
  lang: z.enum(["en", "id"]).default("en"),
});

const createCategoryInput = z.object({
  slug: slugSchema,
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
  fieldLabels: fieldLabelsSchema,
  status: z.enum(["active", "beta", "disabled"]).default("beta"),
  categoryFieldOptions: filterOptionsSchema.default([]),
  locationOptions: filterOptionsSchema.default([]),
  seedPhrases: z.array(seedPhraseSchema).max(60).default([]),
});

/**
 * Creates a new business vertical — instant, no code or migration, see
 * `docs/platform-super-admin-flow.md` §3 (revised). The only guardrails left
 * are the ones enforced here: a validated slug/field-label shape and a
 * bounded lexicon weight scale, not a code review — see that doc's note on
 * the tradeoff this accepts versus the old two-layer design.
 */
export const createCategory = platformActionClient
  .inputSchema(createCategoryInput)
  .action(async ({ parsedInput, ctx }) => {
    const { slug, label, description, fieldLabels, status, categoryFieldOptions, locationOptions, seedPhrases } =
      parsedInput;

    const [created] = await db()
      .insert(schema.categories)
      .values({
        slug,
        label,
        description,
        fieldLabels,
        status,
        filterPresets: { categoryFieldOptions, locationOptions },
        createdByUserId: ctx.user.userId,
        updatedByUserId: ctx.user.userId,
      })
      .onConflictDoNothing({ target: schema.categories.slug })
      .returning({ id: schema.categories.id });
    if (!created) throw new ActionError(`A category with slug "${slug}" already exists.`);

    if (seedPhrases.length > 0) {
      await db()
        .insert(schema.categoryLexiconPhrases)
        .values(seedPhrases.map((p) => ({ categoryId: created.id, ...p })))
        .onConflictDoNothing();
    }

    await db().insert(schema.platformCategoryActions).values({
      platformAdminUserId: ctx.user.userId,
      action: "create_category",
      categoryId: created.id,
      details: { slug, label, status, seedPhraseCount: seedPhrases.length },
    });

    return { id: created.id, slug };
  });

const updateConfigInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "beta", "disabled"]),
  categoryFieldOptions: filterOptionsSchema.default([]),
  locationOptions: filterOptionsSchema.default([]),
  internalNotes: z.string().trim().max(2000).optional(),
});

export const updateCategoryConfig = platformActionClient
  .inputSchema(updateConfigInput)
  .action(async ({ parsedInput, ctx }) => {
    const { id, status, categoryFieldOptions, locationOptions, internalNotes } = parsedInput;

    const [updated] = await db()
      .update(schema.categories)
      .set({
        status,
        filterPresets: { categoryFieldOptions, locationOptions },
        internalNotes: internalNotes || null,
        updatedByUserId: ctx.user.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.categories.id, id))
      .returning({ id: schema.categories.id });
    if (!updated) throw new ActionError("Category not found.");

    await db().insert(schema.platformCategoryActions).values({
      platformAdminUserId: ctx.user.userId,
      action: "update_config",
      categoryId: id,
      details: { status, categoryFieldOptions, locationOptions },
    });

    return { ok: true };
  });

const addPhraseInput = z.object({
  categoryId: z.string().uuid(),
  intent: z.enum(["buyer", "seller", "agent", "investor", "broker"]),
  phrase: z.string().trim().min(1).max(120),
  weight: weightSchema,
  lang: z.enum(["en", "id"]).default("en"),
});

/** The one write that directly changes live scoring behavior — logged as its own `update_lexicon` action, not folded into `update_config`. */
export const addLexiconPhrase = platformActionClient
  .inputSchema(addPhraseInput)
  .action(async ({ parsedInput, ctx }) => {
    const [created] = await db()
      .insert(schema.categoryLexiconPhrases)
      .values(parsedInput)
      .onConflictDoNothing()
      .returning({ id: schema.categoryLexiconPhrases.id });
    if (!created) throw new ActionError("That exact phrase already exists for this intent.");

    await db().insert(schema.platformCategoryActions).values({
      platformAdminUserId: ctx.user.userId,
      action: "update_lexicon",
      categoryId: parsedInput.categoryId,
      details: { op: "add", intent: parsedInput.intent, phrase: parsedInput.phrase, weight: parsedInput.weight },
    });

    return { id: created.id };
  });

const removePhraseInput = z.object({ id: z.string().uuid(), categoryId: z.string().uuid() });

export const removeLexiconPhrase = platformActionClient
  .inputSchema(removePhraseInput)
  .action(async ({ parsedInput, ctx }) => {
    const [deleted] = await db()
      .delete(schema.categoryLexiconPhrases)
      .where(eq(schema.categoryLexiconPhrases.id, parsedInput.id))
      .returning({ intent: schema.categoryLexiconPhrases.intent, phrase: schema.categoryLexiconPhrases.phrase });
    if (!deleted) throw new ActionError("Phrase not found.");

    await db().insert(schema.platformCategoryActions).values({
      platformAdminUserId: ctx.user.userId,
      action: "update_lexicon",
      categoryId: parsedInput.categoryId,
      details: { op: "remove", intent: deleted.intent, phrase: deleted.phrase },
    });

    return { ok: true };
  });
