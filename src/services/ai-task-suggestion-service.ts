import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";

import {
  defaultAiTaskSuggestionModel,
  getAiEnv,
} from "@/lib/ai-env";
import {
  aiTaskSuggestionOutputSchema,
  aiTaskSuggestionRequestSchema,
  normalizeTaskSuggestionOutput,
  taskSuggestionInstructions,
  taskSuggestionPromptVersion,
} from "@/lib/ai-task-suggestions";
import { AppError, NotFoundError } from "@/lib/errors";
import { richTextToPlainText } from "@/lib/rich-text";
import { DecisionRepository } from "@/repositories/decision-repository";
import { MeetingMinutesRepository } from "@/repositories/meeting-minutes-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

const maxSourceCharacters = 80000;

type SuggestionSourceSegment = {
  source: "meeting_minutes" | "agenda_item_minutes";
  agendaItemId: string | null;
  title: string;
  text: string;
};

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
  const redacted = apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message;
  return redacted.slice(0, 1500);
}

function logAiTaskSuggestionError({
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

  console.error("[ai-task-suggestions] AI-analyse fejlede", {
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

export class AiTaskSuggestionService {
  private readonly minutes: MeetingMinutesRepository;
  private readonly meetings: MeetingRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly decisions: DecisionRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.minutes = new MeetingMinutesRepository(db);
    this.meetings = new MeetingRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.decisions = new DecisionRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async suggest(input: unknown) {
    const parsed = aiTaskSuggestionRequestSchema.parse(input);
    const user = await this.auth.requireUser();
    await this.authorization.requireAgendaItemEditor(
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

    const meetingMinutes = await this.minutes.findMeetingMinutes(meeting.id);
    const meetingSegment: SuggestionSourceSegment = {
      source: "meeting_minutes",
      agendaItemId: null,
      title: "Generelt referat",
      text: [meetingMinutes?.minutes_text, meetingMinutes?.decisions]
        .map(richTextToPlainText)
        .filter(Boolean)
        .join("\n\n"),
    };

    let sourceSegments: SuggestionSourceSegment[];
    if (parsed.source === "meeting_minutes") {
      sourceSegments = [meetingSegment];
    } else if (parsed.source === "agenda_item_minutes") {
      const sourceAgendaItemId = parsed.agendaItemId ?? null;
      const occurrence = meeting.agenda_item_occurrences.find(
        (candidate) => candidate.agenda_item_id === sourceAgendaItemId,
      );
      if (!occurrence?.agenda_items) {
        throw new NotFoundError("Dagsordenspunktet på mødet");
      }
      const minutes = await this.minutes.findAgendaItemMinutes(
        meeting.id,
        sourceAgendaItemId!,
      );
      sourceSegments = [
        {
          source: "agenda_item_minutes",
          agendaItemId: sourceAgendaItemId,
          title: occurrence.agenda_items.title,
          text: [minutes?.notes, minutes?.decision, minutes?.follow_up]
            .map(richTextToPlainText)
            .filter(Boolean)
            .join("\n\n"),
        },
      ];
    } else {
      const pointSegments = await Promise.all(
        meeting.agenda_item_occurrences.flatMap((occurrence) =>
          occurrence.agenda_items
            ? [
                this.minutes
                  .findAgendaItemMinutes(
                    meeting.id,
                    occurrence.agenda_item_id,
                  )
                  .then(
                    (minutes): SuggestionSourceSegment => ({
                      source: "agenda_item_minutes",
                      agendaItemId: occurrence.agenda_item_id,
                      title: occurrence.agenda_items!.title,
                      text: [
                        minutes?.notes,
                        minutes?.decision,
                        minutes?.follow_up,
                      ]
                        .map(richTextToPlainText)
                        .filter(Boolean)
                        .join("\n\n"),
                    }),
                  ),
              ]
            : [],
        ),
      );
      sourceSegments = [meetingSegment, ...pointSegments];
    }

    let remainingCharacters = maxSourceCharacters;
    sourceSegments = sourceSegments.flatMap((segment) => {
      const text = segment.text.trim().slice(0, remainingCharacters);
      remainingCharacters -= text.length;
      return text ? [{ ...segment, text }] : [];
    });
    if (sourceSegments.length === 0) {
      return {
        suggestions: [],
        status: "empty" as const,
        model: null,
        promptVersion: taskSuggestionPromptVersion,
        usage: null,
      };
    }

    let selectedModel =
      process.env.OPENAI_TASK_SUGGESTION_MODEL?.trim() ||
      defaultAiTaskSuggestionModel;
    let apiKey: string | undefined;

    try {
      const [organizationMembers, futureMeetings, meetingDecisions] =
        await Promise.all([
          this.members.listMembers(parsed.organizationId),
          this.meetings.listFutureByCommittee(
            parsed.organizationId,
            parsed.committeeId,
            meeting.starts_at,
          ),
          this.decisions.listByMeeting(meeting.id),
        ]);
      const knownMembers = organizationMembers.flatMap((member) =>
        member.status === "active" &&
        member.full_name &&
        member.committees.some(
          (committee) => committee.id === parsed.committeeId,
        )
          ? [
              {
                id: member.user_id,
                name: member.full_name,
              },
            ]
          : [],
      );
      const candidateDecisions = meetingDecisions.filter(
        (decision) => decision.status !== "cancelled",
      );
      const aiEnv = getAiEnv();
      selectedModel = aiEnv.OPENAI_TASK_SUGGESTION_MODEL;
      apiKey = aiEnv.OPENAI_API_KEY;
      const openai = new OpenAI({ apiKey });
      const allSuggestions = [];
      let totalUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      let hasUsage = false;

      for (const segment of sourceSegments) {
        const response = await openai.responses.parse({
          model: selectedModel,
          store: false,
          text: {
            format: zodTextFormat(
              aiTaskSuggestionOutputSchema,
              "task_suggestions",
            ),
          },
          input: [
            { role: "system", content: taskSuggestionInstructions },
            {
              role: "user",
              content: [
                `Kilde: ${segment.source}`,
                `Møde: ${meeting.title}`,
                segment.agendaItemId
                  ? `Dagsordenspunkt-id: ${segment.agendaItemId}`
                  : "Dagsordenspunkt-id: ikke relevant",
                `Kildetitel: ${segment.title}`,
                `Mødedato: ${meeting.starts_at.slice(0, 10)}`,
                `Kendte udvalgsmedlemmer: ${
                  knownMembers.map((member) => member.name).join(", ") ||
                  "ingen tilgængelige"
                }`,
                `Eksisterende beslutninger: ${
                  candidateDecisions
                    .filter(
                      (decision) =>
                        !segment.agendaItemId ||
                        decision.agenda_item_id === segment.agendaItemId,
                    )
                    .map((decision) => decision.title)
                    .join(" | ") || "ingen"
                }`,
                "",
                "REFERATINDHOLD:",
                segment.text,
              ].join("\n"),
            },
          ],
        });

        if (response.error) {
          throw new AppError(
            "AI-tjenesten kunne ikke gennemføre analysen. Prøv igen.",
            502,
            "AI_PROVIDER_RESPONSE_ERROR",
          );
        }
        if (response.incomplete_details) {
          throw new AppError(
            "AI-analysen blev ikke færdig. Prøv igen.",
            502,
            "AI_INCOMPLETE_OUTPUT",
          );
        }
        if (responseWasRefused(response.output)) {
          throw new AppError(
            "AI-tjenesten kunne ikke analysere dette referat. Prøv igen eller tilpas referatet.",
            422,
            "AI_REFUSED",
          );
        }
        if (!response.output_parsed) {
          throw new AppError(
            "AI returnerede et ugyldigt svar. Prøv analysen igen.",
            502,
            "AI_INVALID_OUTPUT",
          );
        }

        try {
          allSuggestions.push(
            ...normalizeTaskSuggestionOutput(
              response.output_parsed,
              segment.source,
              segment.agendaItemId,
              segment.title,
              {
                meetingDate: meeting.starts_at,
                meetingId: meeting.id,
                meetingTitle: meeting.title,
                members: knownMembers,
                futureMeetings: futureMeetings.map((futureMeeting) => ({
                  id: futureMeeting.id,
                  title: futureMeeting.title,
                  startsAt: futureMeeting.starts_at,
                })),
                decisions: candidateDecisions.map((decision) => ({
                  id: decision.id,
                  title: decision.title,
                  agendaItemId: decision.agenda_item_id,
                })),
              },
            ),
          );
        } catch (error) {
          if (error instanceof ZodError) {
            throw new AppError(
              "AI returnerede et svar i et ugyldigt format. Prøv analysen igen.",
              502,
              "AI_INVALID_OUTPUT",
            );
          }
          throw error;
        }

        if (response.usage) {
          hasUsage = true;
          totalUsage = {
            inputTokens: totalUsage.inputTokens + response.usage.input_tokens,
            outputTokens:
              totalUsage.outputTokens + response.usage.output_tokens,
            totalTokens: totalUsage.totalTokens + response.usage.total_tokens,
          };
        }
      }

      return {
        suggestions: allSuggestions,
        status: "completed" as const,
        model: selectedModel,
        promptVersion: taskSuggestionPromptVersion,
        usage: hasUsage ? totalUsage : null,
      };
    } catch (error) {
      logAiTaskSuggestionError({
        error,
        meetingId: meeting.id,
        model: selectedModel,
        apiKey,
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AI-analysen kunne ikke gennemføres. Prøv igen senere.",
        502,
        "AI_REQUEST_FAILED",
      );
    }
  }
}
