"use server";

import { z } from "zod";
import { actionClient } from "@/application/safe-action";
import { getNotifier } from "@/infrastructure/notifiers/registry";
import { serverEnv } from "@/shared/config/env";

const contactSchema = z.object({
  name: z.string().min(1, "Enter your name").max(200),
  email: z.string().email(),
  company: z.string().max(200).optional(),
  message: z.string().min(1, "Enter a message").max(5000),
});

/**
 * Public — no session exists yet. Routes through the same `emailNotifier` used
 * for every other transactional email, so it degrades to a log line (not a
 * hard failure) whenever `RESEND_API_KEY` isn't configured, same as password
 * resets and invites.
 */
export const submitContactRequest = actionClient.inputSchema(contactSchema).action(async ({ parsedInput }) => {
  const from = serverEnv().RESEND_FROM_EMAIL;

  await getNotifier("email").send({
    to: from,
    subject: `New contact request from ${parsedInput.name}`,
    text: [
      `Name: ${parsedInput.name}`,
      `Email: ${parsedInput.email}`,
      parsedInput.company ? `Company: ${parsedInput.company}` : null,
      "",
      parsedInput.message,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return { ok: true };
});
