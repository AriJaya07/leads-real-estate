CREATE TYPE "public"."company_category" AS ENUM('real_estate', 'travel', 'courses', 'other');--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "category" "company_category" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "actor_templates" ADD COLUMN "category" "company_category";