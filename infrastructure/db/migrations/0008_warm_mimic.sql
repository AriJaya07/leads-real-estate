CREATE TYPE "public"."scrape_request_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'aborted', 'timed_out');--> statement-breakpoint
CREATE TABLE "actor_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"requirement_kind" text NOT NULL,
	"description" text,
	"actor_id" text NOT NULL,
	"default_input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_params" text[] DEFAULT '{}' NOT NULL,
	"cost_note" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_template_id" uuid,
	"requested_by_user_id" uuid,
	"template_name" text NOT NULL,
	"platform" text NOT NULL,
	"requirement_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"params_fingerprint" text NOT NULL,
	"status" "scrape_request_status" DEFAULT 'queued' NOT NULL,
	"apify_run_id" text,
	"apify_dataset_id" text,
	"source_id" uuid,
	"dataset_id" uuid,
	"item_count" integer DEFAULT 0 NOT NULL,
	"usage_usd" real,
	"error_summary" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scrape_requests" ADD CONSTRAINT "scrape_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_requests" ADD CONSTRAINT "scrape_requests_actor_template_id_actor_templates_id_fk" FOREIGN KEY ("actor_template_id") REFERENCES "public"."actor_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_requests" ADD CONSTRAINT "scrape_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_requests" ADD CONSTRAINT "scrape_requests_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_requests" ADD CONSTRAINT "scrape_requests_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actor_templates_name_key" ON "actor_templates" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_requests_apify_run_id_key" ON "scrape_requests" USING btree ("apify_run_id");--> statement-breakpoint
CREATE INDEX "scrape_requests_company_requested_idx" ON "scrape_requests" USING btree ("company_id","requested_at");--> statement-breakpoint
CREATE INDEX "scrape_requests_status_idx" ON "scrape_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scrape_requests_dedup_idx" ON "scrape_requests" USING btree ("company_id","actor_template_id","params_fingerprint","requested_at");