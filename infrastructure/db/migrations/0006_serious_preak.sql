ALTER TYPE "public"."usage_metric" ADD VALUE 'raw_records_month';--> statement-breakpoint
ALTER TYPE "public"."usage_metric" ADD VALUE 'apify_requests_month';--> statement-breakpoint
ALTER TYPE "public"."usage_metric" ADD VALUE 'storage_kb';--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "max_seats" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "max_alert_rules" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "features" SET DEFAULT '{"whatsappAlerts":false,"llmShadowClassify":false,"customBranding":false,"prioritySupport":false,"sso":false}'::jsonb;--> statement-breakpoint
-- Defaults match the existing "Legacy" plan's permissive style (see
-- infrastructure/db/seed.mjs) so any pre-existing row (a real deployment
-- that already ran the seed script) gets a sane, effectively-unlimited
-- value instead of this migration failing on NOT NULL with no default.
ALTER TABLE "plans" ADD COLUMN "max_raw_records_per_month" integer NOT NULL DEFAULT 999999999;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "max_apify_requests_per_month" integer NOT NULL DEFAULT 999999;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "max_storage_kb" integer NOT NULL DEFAULT 999999999;--> statement-breakpoint
-- New rows should always specify these explicitly — the default above exists
-- only to satisfy pre-existing rows during the migration itself.
ALTER TABLE "plans" ALTER COLUMN "max_raw_records_per_month" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "max_apify_requests_per_month" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "max_storage_kb" DROP DEFAULT;