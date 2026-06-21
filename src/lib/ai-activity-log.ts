import { z } from "zod";

export const aiActivityStatusSchema = z.enum([
  "generated",
  "applied",
  "dismissed",
  "failed",
]);

export const aiActivityClientStatusSchema = z.object({
  status: z.enum(["applied", "dismissed"]),
});

export type AiActivityClientStatus = z.infer<
  typeof aiActivityClientStatusSchema
>["status"];

export const AI_ACTIVITY_TEXT_LIMIT = 20000;

export function limitAiActivityText(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, AI_ACTIVITY_TEXT_LIMIT);
}
