import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  agendaItemDraftAssistantOutputSchema,
  agendaItemDraftAssistantRequestSchema,
  agendaItemDraftInstructions,
  agendaItemDraftPromptVersion,
  generateAgendaItemDraftSuggestion,
  type AgendaItemDraftProvider,
  type AgendaItemDraftProviderInput,
} from "@/lib/agenda-item-draft-assistant";
import { defaultAgendaItemAssistantModel, getAiEnv } from "@/lib/ai-env";
import { AppError } from "@/lib/errors";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class OpenAiAgendaItemDraftProvider implements AgendaItemDraftProvider {
  async generate(input: AgendaItemDraftProviderInput) {
    const env = getAiEnv();
    const model =
      process.env.OPENAI_AGENDA_DRAFT_MODEL?.trim() ||
      env.OPENAI_AGENDA_ASSISTANT_MODEL ||
      defaultAgendaItemAssistantModel;
    const response = await new OpenAI({ apiKey: env.OPENAI_API_KEY }).responses.parse({
      model,
      store: false,
      text: {
        format: zodTextFormat(
          agendaItemDraftAssistantOutputSchema,
          "agenda_item_draft",
        ),
      },
      input: [
        { role: "system", content: agendaItemDraftInstructions },
        {
          role: "user",
          content: [
            `Felt: ${input.targetField}`,
            `Titel: ${input.values.title}`,
            `Type: ${input.values.itemType}`,
            `Nuværende formål: ${input.values.objective || "(tomt)"}`,
            `Nuværende baggrund: ${input.values.description || "(tomt)"}`,
          ].join("\n"),
        },
      ],
    });
    if (!response.output_parsed) {
      throw new AppError(
        "AI returnerede ikke et gyldigt tekstforslag. Prøv igen.",
        502,
        "AI_DRAFT_INVALID_OUTPUT",
      );
    }
    return { suggestion: response.output_parsed.suggestion, model };
  }
}

export class AgendaItemDraftAssistantService {
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(
    db: SupabaseClient<Database>,
    private readonly provider: AgendaItemDraftProvider =
      new OpenAiAgendaItemDraftProvider(),
  ) {
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async suggest(input: unknown) {
    const parsed = agendaItemDraftAssistantRequestSchema.parse(input);
    const user = await this.auth.requireUser();
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    if (parsed.values.title.length < 3) {
      throw new AppError(
        "Skriv en titel på mindst tre tegn, før du beder om et forslag.",
        422,
        "AI_DRAFT_TITLE_REQUIRED",
      );
    }
    try {
      const result = await generateAgendaItemDraftSuggestion(this.provider, {
        targetField: parsed.targetField,
        values: parsed.values,
      });
      return {
        suggestion: result.suggestion,
        meta: {
          model: result.model,
          promptVersion: agendaItemDraftPromptVersion,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const errorRecord =
        typeof error === "object" && error !== null
          ? (error as Record<string, unknown>)
          : null;
      console.error("[agenda-item-draft-assistant] forslag fejlede", {
        organizationId: parsed.organizationId,
        committeeId: parsed.committeeId,
        targetField: parsed.targetField,
        errorName: error instanceof Error ? error.name : "UnknownError",
        status:
          typeof errorRecord?.status === "number"
            ? errorRecord.status
            : undefined,
        code:
          typeof errorRecord?.code === "string" ? errorRecord.code : undefined,
        requestId:
          typeof errorRecord?.request_id === "string"
            ? errorRecord.request_id
            : undefined,
      });
      throw new AppError(
        "AI-forslaget kunne ikke genereres. Din tekst er ikke ændret.",
        502,
        "AI_DRAFT_PROVIDER_FAILED",
      );
    }
  }
}
