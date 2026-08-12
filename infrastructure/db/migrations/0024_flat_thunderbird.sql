ALTER TABLE "category_configs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "category_configs" CASCADE;--> statement-breakpoint
DROP TABLE "category_requests" CASCADE;--> statement-breakpoint
DROP INDEX "platform_category_actions_request_idx";--> statement-breakpoint
DROP INDEX "platform_category_actions_category_idx";--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "category_id" SET DEFAULT 'a92c5632-8cd4-5c4c-be0a-1a7169f875a9';--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_category_actions_category_idx" ON "platform_category_actions" USING btree ("category_id","created_at");--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "actor_templates" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "platform_category_actions" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "platform_category_actions" DROP COLUMN "request_id";--> statement-breakpoint
DROP TYPE "public"."category_request_status";--> statement-breakpoint
DROP TYPE "public"."company_category";