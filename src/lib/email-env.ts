import "server-only";

import { z } from "zod";

const emailEnvSchema = z.object({
  EMAIL_DELIVERY_MODE: z.enum(["stub", "resend"]).default("stub"),
  EMAIL_FROM: z.string().min(3).default("BestyrelsesApp <noreply@example.com>"),
  RESEND_API_KEY: z.string().min(1).optional(),
});

export function getEmailEnv() {
  const requestedDeliveryMode =
    process.env.EMAIL_DELIVERY_MODE === "resend" ? "resend" : "stub";
  const env = emailEnvSchema.parse({
    EMAIL_DELIVERY_MODE: process.env.EMAIL_DELIVERY_MODE || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  });

  return {
    ...env,
    EMAIL_DELIVERY_MODE_REQUESTED: requestedDeliveryMode,
    EMAIL_FROM_CONFIGURED: Boolean(process.env.EMAIL_FROM),
    RESEND_API_KEY_CONFIGURED: Boolean(process.env.RESEND_API_KEY),
    EMAIL_DELIVERY_MODE:
      env.EMAIL_DELIVERY_MODE === "resend" && env.RESEND_API_KEY
        ? "resend"
        : "stub",
  } as const;
}
