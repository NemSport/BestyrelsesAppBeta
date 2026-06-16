import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  agendaItemAssistantInstructions,
  agendaItemAssistantOutputSchema,
  agendaItemAssistantPromptVersion,
  agendaItemAssistantRequestSchema,
  filterGroundedAssistantOutput,
} from "@/lib/agenda-item-assistant";
import {
  defaultAgendaItemAssistantModel,
  getAiEnv,
} from "@/lib/ai-env";
import { AppError, NotFoundError } from "@/lib/errors";
import { richTextToPlainText } from "@/lib/rich-text";
import { AgendaItemRepository } from "@/repositories/agenda-item-repository";
import { DecisionRepository } from "@/repositories/decision-repository";
import { MeetingMinutesRepository } from "@/repositories/meeting-minutes-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

const maxContextCharacters = 50000;

function normalizeCategory(value: string | null) {
  return value?.trim().toLocaleLowerCase("da-DK") ?? "";
}

function cleanText(value: string | null | undefined, max = 3000) {
  return richTextToPlainText(value).slice(0, max);
}

function responseWasRefused(response: { output?: unknown[] }) {
  return response.output?.some((item) => {
    if (typeof item !== "object" || item === null || !("content" in item)) {
      return false;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return false;
    return content.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "type" in entry &&
        entry.type === "refusal" &&
        "refusal" in entry &&
        typeof entry.refusal === "string" &&
        entry.refusal.length > 0,
    );
  });
}

function safeLog(error: unknown, context: {
  agendaItemId: string;
  model: string;
}) {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  console.error("[agenda-item-assistant] analyse fejlede", {
    agendaItemId: context.agendaItemId,
    model: context.model,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage:
      error instanceof Error ? error.message.slice(0, 1000) : "Ukendt AI-fejl",
    status: typeof record?.status === "number" ? record.status : undefined,
    code: typeof record?.code === "string" ? record.code : undefined,
    requestId:
      typeof record?.request_id === "string" ? record.request_id : undefined,
  });
}

export class AgendaItemAssistantService {
  private readonly agendaItems: AgendaItemRepository;
  private readonly decisions: DecisionRepository;
  private readonly tasks: TaskRepository;
  private readonly minutes: MeetingMinutesRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.agendaItems = new AgendaItemRepository(db);
    this.decisions = new DecisionRepository(db);
    this.tasks = new TaskRepository(db);
    this.minutes = new MeetingMinutesRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async prepare(input: unknown) {
    const parsed = agendaItemAssistantRequestSchema.parse(input);
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );

    const item = await this.agendaItems.findWithHistory(parsed.agendaItemId);
    if (
      !item ||
      item.organization_id !== parsed.organizationId ||
      item.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Dagsordenspunktet");
    }

    const [allDecisions, allTasks, pointMinutes] = await Promise.all([
      this.decisions.listByOrganization(parsed.organizationId),
      this.tasks.listByOrganization(parsed.organizationId),
      this.minutes.listByAgendaItem(parsed.agendaItemId),
    ]);

    const directDecisions = allDecisions.filter(
      (decision) =>
        decision.committee_id === parsed.committeeId &&
        decision.agenda_item_id === parsed.agendaItemId,
    );
    const categories = new Set(
      directDecisions
        .map((decision) => normalizeCategory(decision.category))
        .filter(Boolean),
    );
    const relevantDecisions = allDecisions
      .filter(
        (decision) =>
          decision.committee_id === parsed.committeeId &&
          (decision.agenda_item_id === parsed.agendaItemId ||
            categories.has(normalizeCategory(decision.category))),
      )
      .slice(0, 12);
    const relevantDecisionIds = new Set(
      relevantDecisions.map((decision) => decision.id),
    );
    const openTasks = allTasks.filter(
      (task) =>
        task.committee_id === parsed.committeeId &&
        !task.archived_at &&
        task.status !== "completed" &&
        task.status !== "cancelled" &&
        (task.agenda_item_id === parsed.agendaItemId ||
          (task.decision_id
            ? relevantDecisionIds.has(task.decision_id)
            : false) ||
          categories.has(normalizeCategory(task.category))),
    );
    const sortedMinutes = [...pointMinutes].sort((left, right) =>
      (right.meetings?.starts_at ?? "").localeCompare(
        left.meetings?.starts_at ?? "",
      ),
    );
    const lastMinutes = sortedMinutes[0] ?? null;

    const sources = [
      {
        id: `agenda-item:${item.id}`,
        label: `Dagsordenspunkt: ${item.title}`,
        href: null,
        content: [
          item.title,
          cleanText(item.description),
          cleanText(item.objective),
        ]
          .filter(Boolean)
          .join("\n"),
      },
      ...sortedMinutes.slice(0, 8).map((minutes) => ({
        id: `minutes:${minutes.id}`,
        label: minutes.meetings
          ? `${minutes.meetings.title} · ${minutes.meetings.starts_at.slice(0, 10)}`
          : "Tidligere punktreferat",
        href: minutes.meetings
          ? `/organizations/${parsed.organizationId}/committees/${parsed.committeeId}/meetings/${minutes.meetings.id}`
          : null,
        content: [
          cleanText(minutes.notes),
          cleanText(minutes.decision),
          cleanText(minutes.follow_up),
        ]
          .filter(Boolean)
          .join("\n"),
      })),
      ...relevantDecisions.map((decision) => ({
        id: `decision:${decision.id}`,
        label: `Beslutning: ${decision.title}`,
        href: `/organizations/${parsed.organizationId}/decisions#decision-${decision.id}`,
        content: [
          decision.title,
          cleanText(decision.description),
          decision.category,
          `Status: ${decision.status}`,
          `Beslutningsdato: ${decision.decision_date}`,
        ]
          .filter(Boolean)
          .join("\n"),
      })),
      ...openTasks.map((task) => ({
        id: `task:${task.id}`,
        label: `Åben opgave: ${task.title}`,
        href: `/organizations/${parsed.organizationId}/tasks#task-${task.id}`,
        content: [
          task.title,
          cleanText(task.description),
          `Status: ${task.status}`,
          task.deadline ? `Deadline: ${task.deadline}` : null,
          task.responsible?.full_name
            ? `Ansvarlig: ${task.responsible.full_name}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      })),
    ];

    let remaining = maxContextCharacters;
    const boundedSources = sources.flatMap((source) => {
      const content = source.content.trim().slice(0, remaining);
      remaining -= content.length;
      return content ? [{ ...source, content }] : [];
    });
    const allowedSourceIds = new Set(boundedSources.map((source) => source.id));
    const selectedModel =
      process.env.OPENAI_AGENDA_ASSISTANT_MODEL?.trim() ||
      defaultAgendaItemAssistantModel;

    try {
      const env = getAiEnv();
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await openai.responses.parse({
        model: env.OPENAI_AGENDA_ASSISTANT_MODEL,
        store: false,
        text: {
          format: zodTextFormat(
            agendaItemAssistantOutputSchema,
            "agenda_item_memory",
          ),
        },
        input: [
          { role: "system", content: agendaItemAssistantInstructions },
          {
            role: "user",
            content: [
              `Dagsordenspunkt: ${item.title}`,
              "",
              "KILDER:",
              ...boundedSources.map(
                (source) => `[${source.id}] ${source.label}\n${source.content}`,
              ),
            ].join("\n\n"),
          },
        ],
      });

      if (responseWasRefused(response)) {
        throw new AppError(
          "AI-assistenten kunne ikke analysere punktet. Prøv igen.",
          502,
          "AI_ASSISTANT_REFUSED",
        );
      }

      if (!response.output_parsed) {
        throw new AppError(
          "AI returnerede ikke en gyldig mødeforberedelse. Prøv igen.",
          502,
          "AI_INVALID_OUTPUT",
        );
      }

      const { discussionSuggestions, agendaSuggestions } =
        filterGroundedAssistantOutput(
          response.output_parsed,
          allowedSourceIds,
        );

      return {
        lastDiscussed: lastMinutes?.meetings
          ? {
              meetingId: lastMinutes.meetings.id,
              title: lastMinutes.meetings.title,
              startsAt: lastMinutes.meetings.starts_at,
            }
          : null,
        recentMinutes: sortedMinutes.slice(0, 5).map((minutes) => ({
          id: minutes.id,
          meetingId: minutes.meeting_id,
          title: minutes.meetings?.title ?? "Tidligere møde",
          startsAt: minutes.meetings?.starts_at ?? minutes.created_at,
          summary:
            cleanText(
              minutes.decision || minutes.follow_up || minutes.notes,
              180,
            ) || "Der er gemt et punktreferat fra mødet.",
          href: `/organizations/${parsed.organizationId}/committees/${parsed.committeeId}/meetings/${minutes.meeting_id}`,
        })),
        decisions: relevantDecisions.map((decision) => ({
          id: decision.id,
          title: decision.title,
          status: decision.status,
          decisionDate: decision.decision_date,
          href: `/organizations/${parsed.organizationId}/decisions#decision-${decision.id}`,
        })),
        tasks: openTasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          responsible: task.responsible?.full_name ?? null,
          deadline: task.deadline,
          href: `/organizations/${parsed.organizationId}/tasks#task-${task.id}`,
        })),
        discussionSuggestions,
        agendaSuggestions,
        sources: boundedSources.map(({ id, label, href }) => ({
          id,
          label,
          href,
        })),
        meta: {
          model: env.OPENAI_AGENDA_ASSISTANT_MODEL,
          promptVersion: agendaItemAssistantPromptVersion,
        },
      };
    } catch (error) {
      safeLog(error, {
        agendaItemId: parsed.agendaItemId,
        model: selectedModel,
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AI-assistenten kunne ikke forberede punktet. Prøv igen senere.",
        502,
        "AI_ASSISTANT_FAILED",
      );
    }
  }
}
