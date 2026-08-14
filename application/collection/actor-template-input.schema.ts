import { z } from "zod";

/**
 * Shared input validation for "register/edit an actor template" — used by both
 * the tenant-admin entry point (`application/collection/actor-templates.actions.ts`)
 * and the Super Admin entry point (`application/platform/sources.actions.ts`).
 * Lives outside either "use server" module because a server-actions file may
 * only export async actions, not a plain const — see docs/coding-standards.md.
 */

export const paramFieldInput = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "textarea", "url", "number", "select", "multiselect", "tags"]),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(200).optional(),
  helpText: z.string().trim().max(300).optional(),
  options: z.array(z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(80) })).optional(),
});

export const actorTemplateInput = z.object({
  name: z.string().trim().min(1).max(120),
  platform: z.string().trim().min(1).max(40),
  /** Null = useful for every category (e.g. a generic Facebook Groups scraper). */
  categoryId: z.string().uuid().nullable().default(null),
  requirementKind: z.string().trim().min(1).max(60),
  description: z.string().trim().max(2000).optional(),
  actorId: z.string().trim().min(1).max(200),
  defaultInput: z.record(z.string(), z.unknown()).default({}),
  requiredParams: z.array(z.string().trim().min(1)).default([]),
  /** Structured filter fields for the owner-facing "Configure filters" step — see domain/collection/actor-request.ts. */
  paramSchema: z.array(paramFieldInput).default([]),
  costNote: z.string().trim().max(500).optional(),
});
