import { z } from "zod";

export const bestieAgendaContent = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000),
  objective: z.string().trim().min(1).max(400),
});

export const bestieAgendaSuggestion = bestieAgendaContent.extend({
  sourceKind: z.enum(["task", "decision"]),
  sourceId: z.string().uuid(),
});

export type BestieAgendaSuggestion = z.infer<typeof bestieAgendaSuggestion> & {
  sourceTitle: string;
};
