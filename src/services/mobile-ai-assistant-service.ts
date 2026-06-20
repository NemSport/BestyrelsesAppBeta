import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getAiEnv } from "@/lib/ai-env";
import { AppError } from "@/lib/errors";
import {
  mobileAiAssistantInstructions,
  mobileAiAssistantOutputSchema,
  mobileAiAssistantPromptVersion,
} from "@/lib/mobile-ai-assistant";
import { OrganizationService } from "@/services/organization-service";
import type { Database } from "@/types/database";

function logMobileAiError({
  error,
  organizationId,
  model,
}: {
  error: unknown;
  organizationId: string;
  model: string;
}) {
  const typed = error as {
    name?: string;
    message?: string;
    status?: number;
    code?: string;
    type?: string;
  };
  console.error("[mobile-ai-assistant] forespørgsel fejlede", {
    organizationId,
    model,
    name: typed.name,
    message: typed.message,
    status: typed.status,
    code: typed.code,
    type: typed.type,
  });
}

export class MobileAiAssistantService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async ask(input: unknown) {
    const parsed = mobileAiAssistantInput(input);
    const overview = await new OrganizationService(this.db).getOverview(
      parsed.organizationId,
    );
    const context = JSON.stringify(
      {
        committees: overview.committees.map((entry) => ({
          id: entry.committee.id,
          name: entry.committee.name,
          nextMeeting: entry.nextMeeting
            ? {
                id: entry.nextMeeting.id,
                title: entry.nextMeeting.title,
                startsAt: entry.nextMeeting.starts_at,
              }
            : null,
          openTaskCount: entry.openTaskCount,
          activeDecisionCount: entry.activeDecisionCount,
        })),
        upcomingMeetings: overview.upcomingMeetings.map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          startsAt: meeting.starts_at,
          committeeId: meeting.committee_id,
          committeeName: meeting.committeeName,
        })),
        recentMinutes: overview.recentMinutes,
        activeDecisions: overview.activeDecisions.map((decision) => ({
          id: decision.id,
          title: decision.title,
          status: decision.status,
          deadline: decision.deadline,
          category: decision.category,
          committeeId: decision.committee_id,
          meetingId: decision.meeting_id,
        })),
        openTasks: overview.openTasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          deadline: task.deadline,
          category: task.category,
          committeeId: task.committee_id,
          meetingId: task.meeting_id,
          agendaItemId: task.agenda_item_id,
          decisionId: task.decision_id,
        })),
      },
      null,
      2,
    );

    let model = process.env.OPENAI_MEETING_OVERVIEW_MODEL?.trim() || "gpt-4.1-mini";
    try {
      const env = getAiEnv();
      model = env.OPENAI_MEETING_OVERVIEW_MODEL;
      const response = await new OpenAI({ apiKey: env.OPENAI_API_KEY }).responses.parse({
        model,
        store: false,
        text: {
          format: zodTextFormat(
            mobileAiAssistantOutputSchema,
            "mobile_ai_assistant",
          ),
        },
        input: [
          { role: "system", content: mobileAiAssistantInstructions },
          {
            role: "user",
            content: [
              `Spørgsmål: ${parsed.question}`,
              "",
              "Tilgængeligt organisationsuddrag:",
              context,
            ].join("\n"),
          },
        ],
      });

      if (response.error || response.incomplete_details || !response.output_parsed) {
        throw new AppError(
          "AI Assistant kunne ikke svare lige nu. Prøv igen.",
          502,
          "MOBILE_AI_INVALID_OUTPUT",
        );
      }

      return {
        status: "ok" as const,
        answer: mobileAiAssistantOutputSchema.parse(response.output_parsed),
        model,
        promptVersion: mobileAiAssistantPromptVersion,
      };
    } catch (error) {
      logMobileAiError({ error, organizationId: parsed.organizationId, model });
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AI Assistant kunne ikke svare lige nu. Prøv igen senere.",
        502,
        "MOBILE_AI_FAILED",
      );
    }
  }
}

const mobileAiAssistantInputSchema = z.object({
  organizationId: z.string().uuid(),
  question: z
    .string()
    .trim()
    .min(5, "Skriv et lidt længere spørgsmål.")
    .max(1000, "Spørgsmålet må højst være 1.000 tegn."),
});

function mobileAiAssistantInput(input: unknown) {
  return mobileAiAssistantInputSchema.parse(input);
}
