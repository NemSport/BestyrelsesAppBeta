import { z } from "zod";

export const bestieReplySchema = z.object({
  replyId: z.string().uuid(),
  version: z.string().datetime({ offset: true }),
  message: z.string().trim().min(1).max(1500),
});

export const bestieActionSchema = z.object({
  deadline: z.string().nullable(),
  reminder: z.string().nullable(),
  complete: z.boolean(),
});

export const bestiePendingActionSchema = bestieActionSchema.extend({
  taskVersion: z.string().nullable(),
});
export type BestieAction = z.infer<typeof bestieActionSchema>;
export type BestiePendingAction = z.infer<typeof bestiePendingActionSchema>;

export type BestieMessage = {
  id?: string;
  role: "bestie" | "user";
  body: string;
};

export type BestieThread = {
  id: string;
  title: string;
  href: string;
  unread: boolean;
  messages: BestieMessage[];
  followUpOn: string | null;
  version: string;
  pending: BestiePendingAction | null;
};

export function bestiePath(organizationId: string, threadId?: string) {
  const path = `/organizations/${organizationId}/bestie`;
  return threadId ? `${path}?samtale=${threadId}` : path;
}

export function bestieDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function validBestieDate(value: string | null, earliest: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < earliest)
    return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function describeBestieAction(action: BestieAction) {
  const changes = [];
  if (action.complete) changes.push("markere opgaven som færdig");
  if (action.deadline)
    changes.push(`flytte fristen til ${bestieDate(action.deadline)}`);
  if (action.reminder)
    changes.push(`minde dig om at følge op ${bestieDate(action.reminder)}`);
  return changes.join(" og ");
}
