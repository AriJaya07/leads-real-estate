CREATE TYPE "public"."alert_channel" AS ENUM('email', 'whatsapp', 'slack', 'inapp');--> statement-breakpoint
CREATE TYPE "public"."alert_delivery_status" AS ENUM('pending', 'sent', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."dataset_health" AS ENUM('unknown', 'healthy', 'stale', 'degraded', 'schema_drift', 'error');--> statement-breakpoint
CREATE TYPE "public"."dataset_status" AS ENUM('active', 'paused', 'archived', 'missing');--> statement-breakpoint
CREATE TYPE "public"."lead_event_type" AS ENUM('created', 'status_changed', 'assigned', 'note_added', 'contacted', 'alerted', 'reclassified', 'merged');--> statement-breakpoint
CREATE TYPE "public"."lead_intent" AS ENUM('buyer', 'seller', 'agent', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'viewing_booked', 'converted', 'lost', 'archived', 'spam');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('debug', 'info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('apify', 'n8n', 'webform', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'succeeded', 'partial', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."sync_trigger" AS ENUM('cron', 'webhook', 'manual', 'discovery');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'agent');--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'agent' NOT NULL,
	"accepts_assignments" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"item_count" integer NOT NULL,
	"schema_fingerprint" text NOT NULL,
	"field_profile" jsonb NOT NULL,
	"schema_diff" jsonb,
	"accepted_at" timestamp with time zone,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"title" text,
	"producer_id" text,
	"producer_run_id" text,
	"status" "dataset_status" DEFAULT 'active' NOT NULL,
	"health" "dataset_health" DEFAULT 'unknown' NOT NULL,
	"health_detail" text,
	"health_checked_at" timestamp with time zone,
	"item_count" integer DEFAULT 0 NOT NULL,
	"remote_modified_at" timestamp with time zone,
	"remote_created_at" timestamp with time zone,
	"mapping_profile_id" uuid,
	"schema_fingerprint" text,
	"sync_cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_interval_seconds" integer DEFAULT 900 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"next_sync_due_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"path" text NOT NULL,
	"inferred_type" text NOT NULL,
	"nullable" boolean DEFAULT true NOT NULL,
	"fill_rate" real DEFAULT 0 NOT NULL,
	"cardinality" integer DEFAULT 0 NOT NULL,
	"sample_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facetable" boolean DEFAULT false NOT NULL,
	"facetable_override" boolean,
	"mapped_to" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias" text NOT NULL,
	"canonical" text NOT NULL,
	"region" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapping_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_kind" "source_kind" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rules" jsonb NOT NULL,
	"passthrough" boolean DEFAULT true NOT NULL,
	"auto_generated" boolean DEFAULT false NOT NULL,
	"confidence" real,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "source_kind" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_discovered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"source_item_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"payload_hash" text NOT NULL,
	"ingest_offset" integer,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_run_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"stage" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"trigger" "sync_trigger" NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"items_duplicate" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"leads_created" integer DEFAULT 0 NOT NULL,
	"start_cursor" jsonb,
	"end_cursor" jsonb,
	"error_summary" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"currency" text PRIMARY KEY NOT NULL,
	"usd_per_unit" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "lead_event_type" NOT NULL,
	"actor_id" uuid,
	"payload" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_states" (
	"lead_id" uuid PRIMARY KEY NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"first_contacted_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_record_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"canonical_lead_id" uuid,
	"external_id" text NOT NULL,
	"external_url" text,
	"source_group" text,
	"author_name" text,
	"author_url" text,
	"author_avatar_url" text,
	"author_external_id" text,
	"body" text DEFAULT '' NOT NULL,
	"listing_title" text,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"intent" "lead_intent" DEFAULT 'other' NOT NULL,
	"intent_score" integer DEFAULT 0 NOT NULL,
	"quality_score" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"score_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classifier_id" text DEFAULT 'unclassified' NOT NULL,
	"classified_at" timestamp with time zone,
	"property_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"bedrooms" integer,
	"bathrooms" integer,
	"budget_min" bigint,
	"budget_max" bigint,
	"budget_currency" text,
	"budget_usd_min" bigint,
	"budget_usd_max" bigint,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_spam" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"shared" boolean DEFAULT false NOT NULL,
	"filters" jsonb NOT NULL,
	"sort" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_rule_id" uuid,
	"lead_id" uuid,
	"channel" "alert_channel" NOT NULL,
	"status" "alert_delivery_status" DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"recipient" text,
	"error" text,
	"acknowledged_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"predicate" jsonb NOT NULL,
	"channels" "alert_channel"[] NOT NULL,
	"recipients" text[] DEFAULT '{}' NOT NULL,
	"throttle_seconds" integer DEFAULT 300 NOT NULL,
	"digest_threshold" integer DEFAULT 3 NOT NULL,
	"escalate_after_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_mapping_profile_id_mapping_profiles_id_fk" FOREIGN KEY ("mapping_profile_id") REFERENCES "public"."mapping_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_catalog" ADD CONSTRAINT "field_catalog_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_records" ADD CONSTRAINT "raw_records_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_records" ADD CONSTRAINT "raw_records_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_states" ADD CONSTRAINT "lead_states_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_states" ADD CONSTRAINT "lead_states_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_states" ADD CONSTRAINT "lead_states_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_raw_record_id_raw_records_id_fk" FOREIGN KEY ("raw_record_id") REFERENCES "public"."raw_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_hash_key" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_no_key" ON "dataset_versions" USING btree ("dataset_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "datasets_source_external_key" ON "datasets" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "datasets_status_idx" ON "datasets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "datasets_due_idx" ON "datasets" USING btree ("next_sync_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "field_catalog_dataset_path_key" ON "field_catalog" USING btree ("dataset_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "location_aliases_alias_key" ON "location_aliases" USING btree ("alias");--> statement-breakpoint
CREATE UNIQUE INDEX "mapping_profiles_name_version_key" ON "mapping_profiles" USING btree ("name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_kind_name_key" ON "sources" USING btree ("kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_records_dataset_item_key" ON "raw_records" USING btree ("dataset_id","source_item_id");--> statement-breakpoint
CREATE INDEX "raw_records_content_hash_idx" ON "raw_records" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "raw_records_dataset_idx" ON "raw_records" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "sync_events_run_at_idx" ON "sync_events" USING btree ("sync_run_id","at");--> statement-breakpoint
CREATE INDEX "sync_runs_dataset_started_idx" ON "sync_runs" USING btree ("dataset_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "sync_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_events_lead_at_idx" ON "lead_events" USING btree ("lead_id","at");--> statement-breakpoint
CREATE INDEX "lead_states_status_idx" ON "lead_states" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_states_assigned_idx" ON "lead_states" USING btree ("assigned_to");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_raw_record_key" ON "leads" USING btree ("raw_record_id");--> statement-breakpoint
CREATE INDEX "leads_dataset_idx" ON "leads" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "leads_intent_score_idx" ON "leads" USING btree ("intent","intent_score");--> statement-breakpoint
CREATE INDEX "leads_posted_at_idx" ON "leads" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "leads_canonical_idx" ON "leads" USING btree ("canonical_lead_id");--> statement-breakpoint
CREATE INDEX "leads_property_types_idx" ON "leads" USING gin ("property_types");--> statement-breakpoint
CREATE INDEX "leads_locations_idx" ON "leads" USING gin ("locations");--> statement-breakpoint
CREATE INDEX "leads_attributes_idx" ON "leads" USING gin ("attributes");--> statement-breakpoint
CREATE INDEX "leads_search_idx" ON "leads" USING gin (to_tsvector('simple', coalesce("body", '') || ' ' || coalesce("author_name", '') || ' ' || coalesce("listing_title", '')));--> statement-breakpoint
CREATE INDEX "leads_body_trgm_idx" ON "leads" USING gin ("body" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "saved_views" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_dedupe_key" ON "alert_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "alert_deliveries_lead_idx" ON "alert_deliveries" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "alert_deliveries_status_idx" ON "alert_deliveries" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_rules_name_key" ON "alert_rules" USING btree ("name");