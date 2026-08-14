CREATE TYPE "public"."platform_source_action" AS ENUM('register_actor', 'update_actor', 'set_enabled');--> statement-breakpoint
CREATE TABLE "platform_source_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_admin_user_id" uuid,
	"action" "platform_source_action" NOT NULL,
	"actor_template_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_source_actions" ADD CONSTRAINT "platform_source_actions_platform_admin_user_id_users_id_fk" FOREIGN KEY ("platform_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_source_actions" ADD CONSTRAINT "platform_source_actions_actor_template_id_actor_templates_id_fk" FOREIGN KEY ("actor_template_id") REFERENCES "public"."actor_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_source_actions_actor_template_idx" ON "platform_source_actions" USING btree ("actor_template_id","created_at");