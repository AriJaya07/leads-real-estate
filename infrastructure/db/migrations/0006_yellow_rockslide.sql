CREATE TYPE "public"."lead_record_kind" AS ENUM('content_post', 'engagement_like', 'engagement_comment');--> statement-breakpoint
ALTER TABLE "mapping_profiles" ADD COLUMN "record_kind" "lead_record_kind" DEFAULT 'content_post' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "record_kind" "lead_record_kind" DEFAULT 'content_post' NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_record_kind_idx" ON "leads" USING btree ("record_kind");--> statement-breakpoint
CREATE INDEX "leads_engagement_author_idx" ON "leads" USING btree ("author_external_id") WHERE "leads"."record_kind" != 'content_post';