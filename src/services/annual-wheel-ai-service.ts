import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  annualWheelAiInstructions,
  annualWheelAiOutputSchema,
  annualWheelAiPromptVersion,
  annualWheelAiRequestSchema,
  filterAnnualWheelAiOutput,
} from "@/lib/annual-wheel-ai";
import { defaultAnnualWheelAiModel, getAiEnv } from "@/lib/ai-env";
import { AppError } from "@/lib/errors";
import { AnnualWheelService } from "@/services/annual-wheel-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class AnnualWheelAiService {
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async suggest(input: unknown) {
    const parsed = annualWheelAiRequestSchema.parse(input);
    const user = await this.auth.requireUser();
    if (parsed.committeeId) {
      await this.authorization.requireCommitteeMember(
        parsed.organizationId,
        parsed.committeeId,
        user.id,
      );
    } else {
      await this.authorization.requireOrganizationMember(
        parsed.organizationId,
        user.id,
      );
    }

    const overview = await new AnnualWheelService(this.db).getOverview(
      parsed.organizationId,
      parsed.year,
    );
    const events = overview.events.filter(
      (event) =>
        !parsed.committeeId || event.committee_id === parsed.committeeId,
    );
    const calendarItems = overview.calendarItems.filter(
      (item) =>
        !parsed.committeeId || item.committeeId === parsed.committeeId,
    );
    const sources = [
      {
        id: "annual-wheel:overview",
        label: `Årshjul ${parsed.year}`,
        content: events.length
          ? events
              .slice(0, 80)
              .map(
                (event) =>
                  `${event.starts_on}: ${event.title} | ${event.category ?? "uden kategori"} | ${event.priority}`,
              )
              .join("\n")
          : "Der er ingen registrerede aktiviteter i årshjulet.",
      },
      {
        id: "annual-wheel:deadlines",
        label: "Møder og deadlines",
        content: calendarItems.length
          ? calendarItems
              .slice(0, 80)
              .map((item) => `${item.date}: ${item.kind} | ${item.title}`)
              .join("\n")
          : "Der er ingen møder, opgave- eller beslutningsdeadlines i året.",
      },
    ];
    const selectedModel =
      process.env.OPENAI_ANNUAL_WHEEL_MODEL?.trim() ||
      defaultAnnualWheelAiModel;

    try {
      const env = getAiEnv();
      const response = await new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      }).responses.parse({
        model: env.OPENAI_ANNUAL_WHEEL_MODEL,
        store: false,
        text: {
          format: zodTextFormat(
            annualWheelAiOutputSchema,
            "annual_wheel_suggestions",
          ),
        },
        input: [
          { role: "system", content: annualWheelAiInstructions },
          {
            role: "user",
            content: [
              `Planlægningsår: ${parsed.year}`,
              parsed.committeeId
                ? "Scope: ét autoriseret udvalg"
                : "Scope: autoriseret organisationsoverblik",
              "",
              "KILDER:",
              ...sources.map(
                (source) =>
                  `[${source.id}] ${source.label}\n${source.content}`,
              ),
            ].join("\n\n"),
          },
        ],
      });
      if (!response.output_parsed) {
        throw new AppError(
          "AI returnerede ikke gyldige forslag. Prøv igen.",
          502,
          "AI_INVALID_OUTPUT",
        );
      }
      return {
        ...filterAnnualWheelAiOutput(
          response.output_parsed,
          new Set(sources.map((source) => source.id)),
        ),
        sources: sources.map(({ id, label }) => ({ id, label })),
        meta: {
          model: env.OPENAI_ANNUAL_WHEEL_MODEL,
          promptVersion: annualWheelAiPromptVersion,
        },
      };
    } catch (error) {
      console.error("[annual-wheel-ai] analyse fejlede", {
        organizationId: parsed.organizationId,
        committeeId: parsed.committeeId ?? null,
        year: parsed.year,
        model: selectedModel,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Ukendt AI-fejl",
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AI kunne ikke analysere årshjulet. Prøv igen senere.",
        502,
        "ANNUAL_WHEEL_AI_FAILED",
      );
    }
  }
}
