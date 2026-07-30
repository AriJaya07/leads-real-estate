ALTER TABLE "plans" ALTER COLUMN "features" SET DEFAULT '{"whatsappAlerts":false,"llmShadowClassify":false,"aiAssistant":false,"customBranding":false,"prioritySupport":false,"sso":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_summary_model" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_summary_generated_at" timestamp with time zone;