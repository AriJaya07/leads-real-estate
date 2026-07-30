import "server-only";
import { z } from "zod";

/**
 * Server-only configuration. Secrets and deployment identity only — everything
 * operational (which datasets, which actors, alert recipients, sync intervals)
 * lives in the database and is managed from the admin UI. That is the whole
 * point: nobody edits an env var to change what the platform ingests.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  APIFY_API_TOKEN: z.string().min(1, "APIFY_API_TOKEN is required"),
  APIFY_WEBHOOK_SECRET: z.string().min(16, "APIFY_WEBHOOK_SECRET must be at least 16 chars"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),

  /** Base URL used to build absolute links in transactional emails (invites, password resets). */
  APP_URL: z.string().url().default("http://localhost:3000"),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("DreamRue Lead Radar <onboarding@resend.dev>"),

  /**
   * Shared secret for the n8n-triggered scheduler endpoints (`/api/trigger/*`).
   * Optional so an instance that hasn't wired up n8n yet doesn't fail to boot —
   * an unset secret makes every trigger route respond 401 to everything rather
   * than skipping the check, see `application/http/verify-secret.ts`.
   */
  N8N_TRIGGER_SECRET: z.string().min(16, "N8N_TRIGGER_SECRET must be at least 16 chars").optional(),

  /** WhatsApp Cloud API. Optional — without both, the notifier logs instead of sending. */
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  /** Anthropic API key for the shadow-mode LLM classifier. Optional — unset means it never runs. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Explicit opt-in to fire shadow LLM classification alongside the real rules classifier. Default off. */
  LLM_SHADOW_CLASSIFY_ENABLED: z.string().optional(),

  /** Comma-separated allowlist of addresses permitted to request a login link. */
  AUTH_ALLOWED_EMAILS: z.string().default(""),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Lazy so that importing a module which merely *references* config does not
 * crash a build step that has no secrets available.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function allowedEmails(): string[] {
  return serverEnv()
    .AUTH_ALLOWED_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
