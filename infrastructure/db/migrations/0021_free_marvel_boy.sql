CREATE TYPE "public"."super_admin_action" AS ENUM('extend_trial', 'resend_invite');--> statement-breakpoint
CREATE TABLE "super_admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"platform_admin_user_id" uuid NOT NULL,
	"action" "super_admin_action" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "super_admin_actions" ADD CONSTRAINT "super_admin_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_actions" ADD CONSTRAINT "super_admin_actions_platform_admin_user_id_users_id_fk" FOREIGN KEY ("platform_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "super_admin_actions_company_idx" ON "super_admin_actions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "super_admin_actions_admin_idx" ON "super_admin_actions" USING btree ("platform_admin_user_id","created_at");