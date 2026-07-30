CREATE TABLE "automation_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"auto_assign_enabled" boolean DEFAULT false NOT NULL,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_stale_days" integer DEFAULT 3 NOT NULL,
	"reminder_recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"reminder_last_sent_at" timestamp with time zone,
	"weekly_report_enabled" boolean DEFAULT false NOT NULL,
	"weekly_report_recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"weekly_report_last_sent_at" timestamp with time zone,
	"webhook_enabled" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;