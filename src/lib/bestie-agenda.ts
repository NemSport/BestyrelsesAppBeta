import { z } from "zod";

export const bestieAgendaContent = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000),
  objective: z.string().trim().min(1).max(400),
});

export const bestieAgendaSource = z.object({
  sourceKind: z.enum(["task", "decision"]),
  sourceId: z.string().uuid(),
});

export type BestieAgendaSuggestion = z.infer<typeof bestieAgendaContent> &
  z.infer<typeof bestieAgendaSource> & {
    sourceTitle: string;
  };
