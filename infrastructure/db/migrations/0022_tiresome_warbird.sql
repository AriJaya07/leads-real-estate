CREATE TYPE "public"."category_config_status" AS ENUM('active', 'beta', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."category_request_status" AS ENUM('pending', 'in_review', 'shipped', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."platform_category_action" AS ENUM('update_config', 'submit_request', 'update_request_status');--> statement-breakpoint
CREATE TABLE "category_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "company_category" NOT NULL,
	"status" "category_config_status" DEFAULT 'active' NOT NULL,
	"filter_presets" jsonb DEFAULT '{"categoryFieldOptions":[],"locationOptions":[]}'::jsonb NOT NULL,
	"internal_notes" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by_user_id" uuid,
	"label" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"proposed_field_labels" jsonb NOT NULL,
	"proposed_filter_presets" jsonb DEFAULT '{"categoryFieldOptions":[],"locationOptions":[]}'::jsonb NOT NULL,
	"proposed_data_sources" text NOT NULL,
	"proposed_lexicon_notes" text,
	"status" "category_request_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_category_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_admin_user_id" uuid,
	"action" "platform_category_action" NOT NULL,
	"category" "company_category",
	"request_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_configs" ADD CONSTRAINT "category_configs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_requests" ADD CONSTRAINT "category_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_category_actions" ADD CONSTRAINT "platform_category_actions_platform_admin_user_id_users_id_fk" FOREIGN KEY ("platform_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_category_actions" ADD CONSTRAINT "platform_category_actions_request_id_category_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."category_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_configs_category_key" ON "category_configs" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "category_requests_slug_key" ON "category_requests" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "platform_category_actions_category_idx" ON "platform_category_actions" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "platform_category_actions_request_idx" ON "platform_category_actions" USING btree ("request_id","created_at");