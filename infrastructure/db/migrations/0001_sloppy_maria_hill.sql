CREATE TYPE "public"."company_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'paused');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "company_status" DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stripe_price_id" text,
	"max_seats" integer NOT NULL,
	"max_datasets" integer NOT NULL,
	"max_leads_per_month" integer NOT NULL,
	"max_alert_rules" integer NOT NULL,
	"data_retention_days" integer NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider" text,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "sources_kind_name_key";--> statement-breakpoint
DROP INDEX "leads_facebook_id_key";--> statement-breakpoint
DROP INDEX "leads_instagram_id_key";--> statement-breakpoint
DROP INDEX "leads_profile_url_key";--> statement-breakpoint
DROP INDEX "alert_rules_name_key";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "datasets" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "field_catalog" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "raw_records" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_events" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_appearances" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_events" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_states" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_key" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_company_key" ON "subscriptions" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_catalog" ADD CONSTRAINT "field_catalog_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_records" ADD CONSTRAINT "raw_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_appearances" ADD CONSTRAINT "lead_appearances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_states" ADD CONSTRAINT "lead_states_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_company_idx" ON "users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dataset_versions_company_idx" ON "dataset_versions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "datasets_company_idx" ON "datasets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "field_catalog_company_idx" ON "field_catalog" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_company_kind_name_key" ON "sources" USING btree ("company_id","kind","name");--> statement-breakpoint
CREATE INDEX "sources_company_idx" ON "sources" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "raw_records_company_idx" ON "raw_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sync_events_company_idx" ON "sync_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sync_runs_company_idx" ON "sync_runs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lead_appearances_company_idx" ON "lead_appearances" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lead_events_company_idx" ON "lead_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lead_states_company_idx" ON "lead_states" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_company_facebook_id_key" ON "leads" USING btree ("company_id","facebook_id") WHERE "leads"."facebook_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_company_instagram_id_key" ON "leads" USING btree ("company_id","instagram_id") WHERE "leads"."instagram_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_company_profile_url_key" ON "leads" USING btree ("company_id","profile_url") WHERE "leads"."profile_url" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_company_idx" ON "leads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "saved_views_company_idx" ON "saved_views" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "alert_deliveries_company_idx" ON "alert_deliveries" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_rules_company_name_key" ON "alert_rules" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "alert_rules_company_idx" ON "alert_rules" USING btree ("company_id");