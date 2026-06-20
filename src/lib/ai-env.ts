import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";

export const defaultAiTaskSuggestionModel = "gpt-4.1-mini";
export const defaultAgendaItemAssistantModel = "gpt-4.1-mini";
export const defaultAnnualWheelAiModel = "gpt-4.1-mini";
export const defaultJobCardAiModel = "gpt-4.1-mini";
export const defaultMinutesAssistantModel = "gpt-4.1-mini";
export const defaultMeetingOverviewModel = "gpt-4.1-mini";

const aiEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_TASK_SUGGESTION_MODEL: z
    .string()
    .min(1)
    .default(defaultAiTaskSuggestionModel),
  OPENAI_AGENDA_ASSISTANT_MODEL: z
    .string()
    .min(1)
    .default(defaultAgendaItemAssistantModel),
  OPENAI_ANNUAL_WHEEL_MODEL: z
    .string()
    .min(1)
    .default(defaultAnnualWheelAiModel),
  OPENAI_JOB_CARD_MODEL: z
    .string()
    .min(1)
    .default(defaultJobCardAiModel),
  OPENAI_MINUTES_ASSISTANT_MODEL: z
    .string()
    .min(1)
    .default(defaultMinutesAssistantModel),
  OPENAI_MEETING_OVERVIEW_MODEL: z
    .string()
    .min(1)
    .default(defaultMeetingOverviewModel),
});

export function getAiEnv() {
  const result = aiEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_TASK_SUGGESTION_MODEL:
      process.env.OPENAI_TASK_SUGGESTION_MODEL || undefined,
    OPENAI_AGENDA_ASSISTANT_MODEL:
      process.env.OPENAI_AGENDA_ASSISTANT_MODEL || undefined,
    OPENAI_ANNUAL_WHEEL_MODEL:
      process.env.OPENAI_ANNUAL_WHEEL_MODEL || undefined,
    OPENAI_JOB_CARD_MODEL:
      process.env.OPENAI_JOB_CARD_MODEL || undefined,
    OPENAI_MINUTES_ASSISTANT_MODEL:
      process.env.OPENAI_MINUTES_ASSISTANT_MODEL || undefined,
    OPENAI_MEETING_OVERVIEW_MODEL:
      process.env.OPENAI_MEETING_OVERVIEW_MODEL || undefined,
  });

  if (!result.success) {
    throw new AppError(
      "AI-funktionen er ikke konfigureret endnu.",
      503,
      "AI_NOT_CONFIGURED",
    );
  }

  return result.data;
}
