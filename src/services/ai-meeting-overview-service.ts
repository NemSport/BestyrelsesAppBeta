import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAiEnv } from "@/lib/ai-env";
import {
  aiMeetingOverviewOutputSchema,
  aiMeetingOverviewRequestSchema,
  meetingOverviewInstructions,
  meetingOverviewPromptVersion,
} from "@/lib/ai-meeting-overview";
import { formatDanishDateTime } from "@/lib/date-format";
import { AppError, NotFoundError } from "@/lib/errors";
import { richTextToPlainText } from "@/lib/rich-text";
import { DecisionRepository } from "@/repositories/decision-repository";
import { MeetingMinutesRepository } from "@/repositories/meeting-minutes-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { AiActivityLogService } from "@/services/ai-activity-log-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

const maxContextCharacters = 90000;

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

function logAiMeetingOverviewError({
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

  console.error("[ai-meeting-overview] AI-overblik fejlede", {
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

function formatLine(label: string, value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

export class AiMeetingOverviewService {
  private readonly meetings: MeetingRepository;
  private readonly minutes: MeetingMinutesRepository;
  private readonly decisions: DecisionRepository;
  private readonly tasks: TaskRepository;
  private readonly aiActivityLog: AiActivityLogService;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.meetings = new MeetingRepository(db);
    this.minutes = new MeetingMinutesRepository(db);
    this.decisions = new DecisionRepository(db);
    this.tasks = new TaskRepository(db);
    this.aiActivityLog = new AiActivityLogService(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async generate(input: unknown) {
    const parsed = aiMeetingOverviewRequestSchema.parse(input);
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
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

    const [meetingMinutes, agendaItemMinutes, decisions, tasks] =
      await Promise.all([
        this.minutes.findMeetingMinutes(meeting.id),
        this.minutes.listAgendaItemMinutes(meeting.id),
        this.decisions.listByMeeting(meeting.id),
        this.tasks.listByMeeting(meeting.id),
      ]);
    const minutesByAgendaItem = new Map(
      agendaItemMinutes.map((minutes) => [minutes.agenda_item_id, minutes]),
    );

    const agendaSections = meeting.agenda_item_occurrences.flatMap(
      (occurrence, index) => {
        const agendaItem = occurrence.agenda_items;
        if (!agendaItem) return [];
        const minutes = minutesByAgendaItem.get(agendaItem.id);
        return [
          [
            `Punkt ${index + 1}: ${agendaItem.title}`,
            `Type: ${agendaItem.item_type}`,
            formatLine("Formål", agendaItem.objective),
            formatLine("Baggrund", agendaItem.description),
            formatLine("Punktstatus", minutes?.status),
            formatLine("Noter", richTextToPlainText(minutes?.notes)),
            formatLine("Beslutning", richTextToPlainText(minutes?.decision)),
            formatLine("Opfølgning", richTextToPlainText(minutes?.follow_up)),
          ]
            .filter(Boolean)
            .join("\n"),
        ];
      },
    );

    const relatedDecisions = decisions
      .slice(0, 12)
      .map((decision) =>
        [
          decision.title,
          formatLine("Status", decision.status),
          formatLine("Deadline", decision.deadline),
          formatLine("Kategori", decision.category),
          formatLine("Beskrivelse", richTextToPlainText(decision.description)),
        ]
          .filter(Boolean)
          .join(" | "),
      );
    const relatedTasks = tasks
      .slice(0, 12)
      .map((task) =>
        [
          task.title,
          formatLine("Status", task.status),
          formatLine("Deadline", task.deadline),
          formatLine("Kategori", task.category),
          formatLine("Beskrivelse", richTextToPlainText(task.description)),
        ]
          .filter(Boolean)
          .join(" | "),
      );

    const meetingContext = [
      `Møde: ${meeting.title}`,
      `Mødedato: ${formatDanishDateTime(meeting.starts_at, "full")}`,
      formatLine("Mødebeskrivelse", meeting.description),
      "",
      "DAGSORDEN OG PUNKTREFERATER:",
      agendaSections.join("\n\n") || "Ingen dagsordenspunkter.",
      "",
      "GENERELT REFERAT:",
      [
        formatLine("Referattekst", richTextToPlainText(meetingMinutes?.minutes_text)),
        formatLine("Beslutninger", richTextToPlainText(meetingMinutes?.decisions)),
      ]
        .filter(Boolean)
        .join("\n") || "Intet generelt referat endnu.",
      "",
      "RELATEREDE BESLUTNINGER:",
      relatedDecisions.join("\n") || "Ingen relaterede beslutninger.",
      "",
      "RELATEREDE OPGAVER:",
      relatedTasks.join("\n") || "Ingen relaterede opgaver.",
    ]
      .join("\n")
      .slice(0, maxContextCharacters);

    const hasUsefulData =
      agendaSections.length > 0 ||
      richTextToPlainText(meetingMinutes?.minutes_text) ||
      richTextToPlainText(meetingMinutes?.decisions) ||
      relatedDecisions.length > 0 ||
      relatedTasks.length > 0 ||
      meeting.description.trim().length > 0;

    if (!hasUsefulData) {
      return {
        status: "empty" as const,
        overview: null,
        model: null,
        promptVersion: meetingOverviewPromptVersion,
        usage: null,
      };
    }

    let model =
      process.env.OPENAI_MEETING_OVERVIEW_MODEL?.trim() || "gpt-4.1-mini";
    let apiKey: string | undefined;

    try {
      const aiEnv = getAiEnv();
      model = aiEnv.OPENAI_MEETING_OVERVIEW_MODEL;
      apiKey = aiEnv.OPENAI_API_KEY;

      const response = await new OpenAI({ apiKey }).responses.parse({
        model,
        store: false,
        text: {
          format: zodTextFormat(
            aiMeetingOverviewOutputSchema,
            "meeting_overview",
          ),
        },
        input: [
          { role: "system", content: meetingOverviewInstructions },
          {
            role: "user",
            content: [
              "Lav et AI-overblik over dette møde.",
              "Output må ikke behandles som officielt referat.",
              "",
              "MØDEDATA:",
              meetingContext,
            ].join("\n"),
          },
        ],
      });

      if (response.error) {
        throw new AppError(
          "AI kunne ikke generere mødeoverblikket lige nu. Prøv igen.",
          502,
          "AI_PROVIDER_RESPONSE_ERROR",
        );
      }
      if (response.incomplete_details) {
        throw new AppError(
          "AI-overblikket blev ikke færdigt. Prøv igen.",
          502,
          "AI_INCOMPLETE_OUTPUT",
        );
      }
      if (responseWasRefused(response.output)) {
        throw new AppError(
          "AI kunne ikke analysere mødet lige nu. Prøv igen senere.",
          422,
          "AI_REFUSED",
        );
      }
      if (!response.output_parsed) {
        throw new AppError(
          "AI returnerede et ugyldigt overblik. Prøv igen.",
          502,
          "AI_INVALID_OUTPUT",
        );
      }

      const overview = aiMeetingOverviewOutputSchema.parse(
        response.output_parsed,
      );
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
        agendaItemId: null,
        userId: user.id,
        field: "meeting_overview",
        actionType: "generate_meeting_overview",
        originalText: meetingContext,
        aiSuggestion: JSON.stringify(overview),
        label: "AI-resumÃ©",
        model,
        promptVersion: meetingOverviewPromptVersion,
        metadata: {
          usage,
          agendaItemCount: meeting.agenda_item_occurrences.length,
          relatedDecisionCount: relatedDecisions.length,
          relatedTaskCount: relatedTasks.length,
        },
      });

      return {
        status: "ok" as const,
        overview,
        activityLogId,
        model,
        promptVersion: meetingOverviewPromptVersion,
        usage,
      };
    } catch (error) {
      logAiMeetingOverviewError({
        error,
        meetingId: meeting.id,
        model,
        apiKey,
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AI kunne ikke generere mødeoverblikket lige nu. Prøv igen senere.",
        502,
        "AI_REQUEST_FAILED",
      );
    }
  }
}
