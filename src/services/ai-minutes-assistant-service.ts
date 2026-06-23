import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAiEnv } from "@/lib/ai-env";
import {
  aiMinutesAssistantActionLabels,
  aiMinutesAssistantOutputSchema,
  aiMinutesAssistantRequestSchema,
  minutesAssistantInstructions,
  minutesAssistantPromptVersion,
} from "@/lib/ai-minutes-assistant";
import { formatDanishDate } from "@/lib/date-format";
import { AppError, NotFoundError } from "@/lib/errors";
import {
  richTextToPlainText,
  sanitizeRichText,
} from "@/lib/rich-text";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { AiActivityLogService } from "@/services/ai-activity-log-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | null {
  return typeof value === "object" && value !== null
    ? (value as ErrorRecord)
    : null;
}

function readString(record: ErrorRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(record: ErrorRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

function safeErrorMessage(error: unknown, apiKey?: string) {
  const message =
    error instanceof Error
      ? error.message
      : readString(asRecord(error), "message") || "Ukendt AI-fejl";
  return (apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message).slice(
    0,
    1500,
  );
}

function logAiMinutesAssistantError({
  error,
  meetingId,
  model,
  apiKey,
}: {
  error: unknown;
  meetingId: string;
  model: string;
  apiKey?: string;
}) {
  const record = asRecord(error);
  const nested = asRecord(record?.error);

  console.error("[ai-minutes-assistant] Omskrivning fejlede", {
    meetingId,
    model,
    errorName:
      error instanceof Error
        ? error.name
        : readString(record, "name") || "UnknownError",
    errorMessage: safeErrorMessage(error, apiKey),
    status:
      readNumber(record, "status") || readNumber(record, "statusCode"),
    code: readString(record, "code") || readString(nested, "code"),
    type: readString(record, "type") || readString(nested, "type"),
    requestId:
      readString(record, "request_id") ||
      readString(record, "requestID") ||
      readString(record, "_request_id"),
  });
}

function responseWasRefused(
  output: Array<{
    type: string;
    content?: Array<{ type: string }>;
  }>,
) {
  return output.some(
    (item) =>
      item.type === "message" &&
      item.content?.some((content) => content.type === "refusal"),
  );
}

export class AiMinutesAssistantService {
  private readonly meetings: MeetingRepository;
  private readonly aiActivityLog: AiActivityLogService;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.meetings = new MeetingRepository(db);
    this.aiActivityLog = new AiActivityLogService(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async rewrite(input: unknown) {
    const parsed = aiMinutesAssistantRequestSchema.parse(input);
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );

    const meeting = await this.meetings.findWithAgenda(parsed.meetingId);
    if (
      !meeting ||
      meeting.organization_id !== parsed.organizationId ||
      meeting.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Mødet");
    }

    const agendaItem = parsed.agendaItemId
      ? meeting.agenda_item_occurrences.find(
          (occurrence) => occurrence.agenda_item_id === parsed.agendaItemId,
        )?.agenda_items
      : null;
    if (parsed.source === "agenda_item_minutes" && !agendaItem) {
      throw new NotFoundError("Dagsordenspunktet på mødet");
    }

    const plainText = richTextToPlainText(parsed.text);
    if (plainText.trim().length < 20) {
      throw new AppError(
        "Teksten er for kort til at give et brugbart forslag.",
        422,
        "MINUTES_TEXT_TOO_SHORT",
      );
    }

    let model = process.env.OPENAI_MINUTES_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini";
    let apiKey: string | undefined;

    try {
      const aiEnv = getAiEnv();
      model = aiEnv.OPENAI_MINUTES_ASSISTANT_MODEL;
      apiKey = aiEnv.OPENAI_API_KEY;

      const response = await new OpenAI({ apiKey }).responses.parse({
        model,
        store: false,
        text: {
          format: zodTextFormat(
            aiMinutesAssistantOutputSchema,
            "minutes_rewrite",
          ),
        },
        input: [
          { role: "system", content: minutesAssistantInstructions },
          {
            role: "user",
            content: [
              `Handling: ${aiMinutesAssistantActionLabels[parsed.action]}`,
              `Møde: ${meeting.title}`,
              `Mødedato: ${formatDanishDate(meeting.starts_at, "long")}`,
              agendaItem ? `Dagsordenspunkt: ${agendaItem.title}` : "",
              `Felt: ${parsed.field}`,
              "",
              "ORIGINAL TEKST:",
              plainText.slice(0, 60000),
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      });

      if (response.error) {
        throw new AppError(
          "AI kunne ikke omskrive teksten lige nu. Prøv igen.",
          502,
          "AI_PROVIDER_RESPONSE_ERROR",
        );
      }
      if (response.incomplete_details) {
        throw new AppError(
          "AI-forslaget blev ikke færdigt. Prøv igen.",
          502,
          "AI_INCOMPLETE_OUTPUT",
        );
      }
      if (responseWasRefused(response.output)) {
        throw new AppError(
          "AI kunne ikke omskrive teksten lige nu. Prøv igen med en anden tekst.",
          422,
          "AI_REFUSED",
        );
      }
      if (!response.output_parsed) {
        throw new AppError(
          "AI returnerede et ugyldigt forslag. Prøv igen.",
          502,
          "AI_INVALID_OUTPUT",
        );
      }

      const parsedOutput = aiMinutesAssistantOutputSchema.parse(
        response.output_parsed,
      );
      const suggestionHtml = sanitizeRichText(parsedOutput.suggestionHtml);
      if (!richTextToPlainText(suggestionHtml)) {
        throw new AppError(
          "AI returnerede et tomt forslag. Prøv igen.",
          502,
          "AI_EMPTY_OUTPUT",
        );
      }

      const suggestionText = richTextToPlainText(suggestionHtml);
      const usage = response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : null;
      const activityLogId = await this.aiActivityLog.recordGenerated({
        organizationId: parsed.organizationId,
        meetingId: meeting.id,
        agendaItemId: agendaItem?.id ?? null,
        userId: user.id,
        field: parsed.field,
        actionType: parsed.action,
        originalText: plainText,
        aiSuggestion: suggestionText,
        label: "AI-omskrivning",
        model,
        promptVersion: minutesAssistantPromptVersion,
        metadata: {
          source: parsed.source,
          usage,
        },
      });

      return {
        action: parsed.action,
        originalHtml: sanitizeRichText(parsed.text),
        originalText: plainText,
        suggestionHtml,
        suggestionText,
        summary: parsedOutput.summary,
        activityLogId,
        model,
        promptVersion: minutesAssistantPromptVersion,
        usage,
      };
    } catch (error) {
      logAiMinutesAssistantError({
        error,
        meetingId: meeting.id,
        model,
        apiKey,
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AI kunne ikke omskrive teksten lige nu. Prøv igen senere.",
        502,
        "AI_REQUEST_FAILED",
      );
    }
  }
}
