CREATE TYPE "public"."lead_potential" AS ENUM('high_potential', 'medium_potential', 'low_potential');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lead_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "data_quality_tier" "lead_potential" DEFAULT 'low_potential' NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_lead_score_idx" ON "leads" USING btree ("lead_score");--> statement-breakpoint
CREATE INDEX "leads_data_quality_tier_idx" ON "leads" USING btree ("data_quality_tier");