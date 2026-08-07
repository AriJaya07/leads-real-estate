CREATE TYPE "public"."api_key_scope" AS ENUM('leads:read', 'leads:write');--> statement-breakpoint
CREATE TABLE "api_key_rate_counters" (
	"api_key_id" uuid NOT NULL,
	"window_seconds" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_key_rate_counters_api_key_id_window_seconds_window_start_pk" PRIMARY KEY("api_key_id","window_seconds","window_start")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scope" "api_key_scope" DEFAULT 'leads:read' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "api_rate_limit_per_minute" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "api_rate_limit_burst" integer;--> statement-breakpoint
ALTER TABLE "api_key_rate_counters" ADD CONSTRAINT "api_key_rate_counters_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_key" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_company_idx" ON "api_keys" USING btree ("company_id");