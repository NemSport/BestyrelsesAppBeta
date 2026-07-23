import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

const uxReviewEnvSchema = z.object({
  UX_REVIEW_TOKEN: z.string().min(32),
  UX_REVIEW_USER_EMAIL: z.string().email(),
});

export type UxReviewEnvironmentResult =
  | {
      ok: true;
      value: z.infer<typeof uxReviewEnvSchema>;
    }
  | {
      ok: false;
      reason:
        | "environment-not-preview"
        | "review-disabled"
        | "invalid-server-environment";
    };

export function getUxReviewEnv(): UxReviewEnvironmentResult {
  if (process.env.VERCEL_ENV !== "preview") {
    return { ok: false, reason: "environment-not-preview" };
  }
  if (process.env.UX_REVIEW_ENABLED !== "true") {
    return { ok: false, reason: "review-disabled" };
  }

  const parsed = uxReviewEnvSchema.safeParse({
    UX_REVIEW_TOKEN: process.env.UX_REVIEW_TOKEN,
    UX_REVIEW_USER_EMAIL: process.env.UX_REVIEW_USER_EMAIL,
  });

  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: "invalid-server-environment" };
}
