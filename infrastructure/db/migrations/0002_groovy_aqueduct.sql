ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_versions" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "datasets" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "field_catalog" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_records" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_events" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_appearances" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_events" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_states" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "company_id" SET NOT NULL;