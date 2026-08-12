CREATE TYPE "public"."lexicon_intent" AS ENUM('buyer', 'seller', 'agent', 'investor', 'broker');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"field_labels" jsonb NOT NULL,
	"status" "category_config_status" DEFAULT 'active' NOT NULL,
	"filter_presets" jsonb DEFAULT '{"categoryFieldOptions":[],"locationOptions":[]}'::jsonb NOT NULL,
	"internal_notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_lexicon_phrases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"intent" "lexicon_intent" NOT NULL,
	"phrase" text NOT NULL,
	"weight" integer NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Categories migration pass 1/2: the category_requests workflow these two
-- actions belonged to is retired (category creation is instant now, see
-- docs/platform-super-admin-flow.md) — clear the handful of dev/e2e-only
-- audit rows using values the new enum doesn't have, or the type change
-- below fails its USING cast.
DELETE FROM "platform_category_actions" WHERE "action" IN ('submit_request', 'update_request_status');--> statement-breakpoint
ALTER TABLE "platform_category_actions" ALTER COLUMN "action" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."platform_category_action";--> statement-breakpoint
CREATE TYPE "public"."platform_category_action" AS ENUM('create_category', 'update_config', 'update_lexicon');--> statement-breakpoint
ALTER TABLE "platform_category_actions" ALTER COLUMN "action" SET DATA TYPE "public"."platform_category_action" USING "action"::"public"."platform_category_action";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "actor_templates" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_category_actions" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_lexicon_phrases" ADD CONSTRAINT "category_lexicon_phrases_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "category_lexicon_phrases_unique" ON "category_lexicon_phrases" USING btree ("category_id","intent","phrase","lang");--> statement-breakpoint
CREATE INDEX "category_lexicon_phrases_category_idx" ON "category_lexicon_phrases" USING btree ("category_id","intent");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_templates" ADD CONSTRAINT "actor_templates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_category_actions" ADD CONSTRAINT "platform_category_actions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;