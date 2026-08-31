import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "@/lib/errors";
import {
  sortAgendaItemHistory,
  type AgendaItemHistoryMetadata,
} from "@/lib/agenda-item-history";
import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type {
  AgendaItem,
  AgendaItemHistoryEntry,
  AgendaItemHistoryLinkCandidate,
  AgendaItemWithOccurrences,
} from "@/types/domain";

type AgendaItemHistoryRecord = Pick<
  AgendaItem,
  | "id"
  | "agenda_item_thread_id"
  | "title"
  | "description"
  | "objective"
  | "item_type"
  | "lifecycle_status"
  | "created_at"
> & {
  agenda_item_occurrences: Array<{
    id: string;
    meeting_id: string;
    position: number;
    meeting_status: Database["public"]["Enums"]["occurrence_status"];
    outcome_summary: string;
    created_at: string;
    deleted_at: string | null;
    meetings: {
      id: string;
      title: string;
      starts_at: string;
      status: Database["public"]["Enums"]["meeting_status"];
      deleted_at: string | null;
    } | null;
  }>;
};

type AgendaItemHistoryLinkRecord = Pick<
  AgendaItem,
  "id" | "agenda_item_thread_id" | "title" | "item_type"
> & {
  agenda_item_occurrences: Array<{
    id: string;
    position: number;
    deleted_at: string | null;
    meetings: {
      id: string;
      title: string;
      starts_at: string;
      deleted_at: string | null;
    } | null;
  }>;
};

function normalizedHistorySearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("da-DK")
    .trim();
}

export class AgendaItemRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listByCommittee(committeeId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select(
        "*, agenda_item_occurrences(*, meetings(id, title, starts_at, status))",
      )
      .eq("committee_id", committeeId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as AgendaItemWithOccurrences[]).map(
      this.activeOccurrences,
    );
  }

  async listByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data as AgendaItem[];
  }

  async findWithHistory(agendaItemId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select(
        "*, agenda_item_occurrences(*, meetings(id, title, starts_at, status))",
      )
      .eq("id", agendaItemId)
      .is("deleted_at", null)
      .order("created_at", {
        referencedTable: "agenda_item_occurrences",
        ascending: false,
      })
      .maybeSingle();
    if (error) throw error;
    return data
      ? this.activeOccurrences(data as unknown as AgendaItemWithOccurrences)
      : null;
  }

  async findIncludingDeleted(agendaItemId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select("*")
      .eq("id", agendaItemId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getAgendaItemHistory(input: {
    organizationId: string;
    committeeId: string;
    agendaItemId: string;
  }) {
    const { data: source, error: sourceError } = await this.db
      .from("agenda_items")
      .select("id,agenda_item_thread_id")
      .eq("id", input.agendaItemId)
      .eq("organization_id", input.organizationId)
      .eq("committee_id", input.committeeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return null;

    const { data, error } = await this.db
      .from("agenda_items")
      .select(
        "id,agenda_item_thread_id,title,description,objective,item_type,lifecycle_status,created_at,agenda_item_occurrences!inner(id,meeting_id,position,meeting_status,outcome_summary,created_at,deleted_at,meetings!inner(id,title,starts_at,status,deleted_at))",
      )
      .eq("agenda_item_thread_id", source.agenda_item_thread_id)
      .eq("organization_id", input.organizationId)
      .eq("committee_id", input.committeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .order("position", {
        referencedTable: "agenda_item_occurrences",
        ascending: true,
      });
    if (error) throw error;

    const records = data as unknown as AgendaItemHistoryRecord[];
    const agendaItemIds = records.map((item) => item.id);
    if (agendaItemIds.length === 0) {
      return { threadId: source.agenda_item_thread_id, entries: [] };
    }
    const [decisionResult, taskResult, minutesResult, transferResult] =
      await Promise.all([
      this.db
        .from("decisions")
        .select(
          "id,agenda_item_id,meeting_id,title,description,status,decision_date,archived_at,cancelled_at",
        )
        .eq("organization_id", input.organizationId)
        .eq("committee_id", input.committeeId)
        .in("agenda_item_id", agendaItemIds)
        .is("archived_at", null)
        .is("cancelled_at", null)
        .neq("status", "cancelled")
        .order("decision_date", { ascending: true }),
      this.db
        .from("tasks")
        .select(
          "id,agenda_item_id,meeting_id,title,status,deadline,responsible:profiles!tasks_responsible_user_id_fkey(full_name)",
        )
        .eq("organization_id", input.organizationId)
        .eq("committee_id", input.committeeId)
        .in("agenda_item_id", agendaItemIds)
        .is("archived_at", null),
      this.db
        .from("agenda_item_minutes")
        .select(
          "agenda_item_id,meeting_id,agenda_item_occurrence_id,notes,decision,follow_up,status",
        )
        .eq("organization_id", input.organizationId)
        .eq("committee_id", input.committeeId)
        .in("agenda_item_id", agendaItemIds),
      this.db
        .from("transferred_agenda_items")
        .select(
          "source_agenda_item_id,source_meeting_id,source_agenda_item_occurrence_id,transfer_reason,status",
        )
        .eq("organization_id", input.organizationId)
        .eq("committee_id", input.committeeId)
        .in("source_agenda_item_id", agendaItemIds),
      ]);
    if (decisionResult.error) throw decisionResult.error;
    if (taskResult.error) throw taskResult.error;
    if (minutesResult.error) throw minutesResult.error;
    if (transferResult.error) throw transferResult.error;

    const decisionsByTreatment = new Map<
      string,
      AgendaItemHistoryEntry["decisions"]
    >();
    for (const decision of decisionResult.data) {
      if (!decision.agenda_item_id || !decision.meeting_id) continue;
      const treatmentKey = `${decision.agenda_item_id}:${decision.meeting_id}`;
      const decisions = decisionsByTreatment.get(treatmentKey) ?? [];
      decisions.push({
        id: decision.id,
        title: decision.title,
        description: decision.description,
        status: decision.status,
        decisionDate: decision.decision_date,
      });
      decisionsByTreatment.set(treatmentKey, decisions);
    }
    const tasksByTreatment = new Map<
      string,
      AgendaItemHistoryEntry["tasks"]
    >();
    const openTaskCountByTreatment = new Map<string, number>();
    for (const task of taskResult.data) {
      if (!task.agenda_item_id || !task.meeting_id) continue;
      const treatmentKey = `${task.agenda_item_id}:${task.meeting_id}`;
      const tasks = tasksByTreatment.get(treatmentKey) ?? [];
      const responsible = Array.isArray(task.responsible)
        ? task.responsible[0]
        : task.responsible;
      tasks.push({
        id: task.id,
        title: task.title,
        status: task.status,
        deadline: task.deadline,
        responsibleName: responsible?.full_name ?? null,
      });
      tasksByTreatment.set(treatmentKey, tasks);
      if (task.status !== "completed" && task.status !== "cancelled") {
        openTaskCountByTreatment.set(
          treatmentKey,
          (openTaskCountByTreatment.get(treatmentKey) ?? 0) + 1,
        );
      }
    }
    const minutesByOccurrence = new Map(
      minutesResult.data.flatMap((minutes) =>
        minutes.agenda_item_occurrence_id
          ? [[minutes.agenda_item_occurrence_id, minutes] as const]
          : [],
      ),
    );
    const minutesByTreatment = new Map<
      string,
      (typeof minutesResult.data)[number]
    >(
      minutesResult.data.map(
        (minutes) => [
          `${minutes.agenda_item_id}:${minutes.meeting_id}`,
          minutes,
        ] as const,
      ),
    );
    const transfersByTreatment = new Map<
      string,
      (typeof transferResult.data)[number]
    >(
      transferResult.data.map(
        (transfer) => [
          `${transfer.source_agenda_item_id}:${transfer.source_meeting_id}`,
          transfer,
        ] as const,
      ),
    );

    const entries = records.flatMap(
      (item): AgendaItemHistoryEntry[] => {
        const visibleOccurrences = item.agenda_item_occurrences.filter(
          (occurrence) =>
            !occurrence.deleted_at &&
            occurrence.meetings !== null &&
            !occurrence.meetings.deleted_at,
        );

        return visibleOccurrences.map((occurrence) => {
          const treatmentKey = `${item.id}:${occurrence.meetings!.id}`;
          const minutes =
            minutesByOccurrence.get(occurrence.id) ??
            minutesByTreatment.get(treatmentKey) ??
            null;
          const transfer = transfersByTreatment.get(treatmentKey) ?? null;

          return {
            id: item.id,
            occurrenceId: occurrence.id,
            threadId: item.agenda_item_thread_id,
            meetingId: occurrence.meetings!.id,
            meetingTitle: occurrence.meetings!.title,
            meetingDate: occurrence.meetings!.starts_at,
            meetingStatus: occurrence.meetings!.status,
            agendaItemNumber: occurrence.position + 1,
            title: item.title,
            type: item.item_type,
            background: item.description,
            objective: item.objective,
            outcomeSummary: occurrence.outcome_summary,
            status: occurrence.meeting_status,
            minutes: minutes
              ? {
                  notes: minutes.notes,
                  decision: minutes.decision,
                  followUp: minutes.follow_up,
                  status: minutes.status,
                }
              : null,
            decisions: decisionsByTreatment.get(treatmentKey) ?? [],
            tasks: tasksByTreatment.get(treatmentKey) ?? [],
            openTaskCount: openTaskCountByTreatment.get(treatmentKey) ?? 0,
            transfer: transfer
              ? { reason: transfer.transfer_reason, status: transfer.status }
              : null,
            createdAt: occurrence.created_at,
          };
        });
      },
    );

    return {
      threadId: source.agenda_item_thread_id,
      entries: sortAgendaItemHistory(entries),
    };
  }

  async getAgendaItemHistoryMetadataBatch(input: {
    organizationId: string;
    committeeId: string;
    agendaItemIds: string[];
  }): Promise<AgendaItemHistoryMetadata[]> {
    if (input.agendaItemIds.length === 0) return [];

    const { data: sources, error: sourceError } = await this.db
      .from("agenda_items")
      .select("id,agenda_item_thread_id")
      .eq("organization_id", input.organizationId)
      .eq("committee_id", input.committeeId)
      .in("id", input.agendaItemIds)
      .is("deleted_at", null);
    if (sourceError) throw sourceError;
    if (sources.length === 0) return [];

    const threadIds = [...new Set(sources.map((source) => source.agenda_item_thread_id))];
    const { data: threadItems, error: threadError } = await this.db
      .from("agenda_items")
      .select(
        "agenda_item_thread_id,agenda_item_occurrences(id,deleted_at,meetings(id,deleted_at))",
      )
      .eq("organization_id", input.organizationId)
      .eq("committee_id", input.committeeId)
      .in("agenda_item_thread_id", threadIds)
      .is("deleted_at", null);
    if (threadError) throw threadError;

    const countsByThread = new Map<string, number>();
    for (const item of threadItems as unknown as Array<{
      agenda_item_thread_id: string;
      agenda_item_occurrences: Array<{
        deleted_at: string | null;
        meetings: { deleted_at: string | null } | null;
      }>;
    }>) {
      const visibleCount = item.agenda_item_occurrences.filter(
        (occurrence) =>
          !occurrence.deleted_at &&
          occurrence.meetings !== null &&
          !occurrence.meetings.deleted_at,
      ).length;
      countsByThread.set(
        item.agenda_item_thread_id,
        (countsByThread.get(item.agenda_item_thread_id) ?? 0) + visibleCount,
      );
    }

    return sources.map((source) => ({
      agendaItemId: source.id,
      threadId: source.agenda_item_thread_id,
      historyCount: countsByThread.get(source.agenda_item_thread_id) ?? 0,
    }));
  }

  async countActiveThreadMembers(input: {
    organizationId: string;
    committeeId: string;
    threadId: string;
  }) {
    const { count, error } = await this.db
      .from("agenda_items")
      .select("id", { count: "exact", head: true })
      .eq("agenda_item_thread_id", input.threadId)
      .eq("organization_id", input.organizationId)
      .eq("committee_id", input.committeeId);
    if (error) throw error;
    return count ?? 0;
  }

  async searchHistoryLinkCandidates(input: {
    organizationId: string;
    committeeId: string;
    sourceAgendaItemId: string;
    sourceThreadId: string;
    query: string;
    beforeOrAt: string;
  }): Promise<AgendaItemHistoryLinkCandidate[]> {
    const { data, error } = await this.db
      .from("agenda_items")
      .select(
        "id,agenda_item_thread_id,title,item_type,agenda_item_occurrences(id,position,deleted_at,meetings(id,title,starts_at,deleted_at))",
      )
      .eq("organization_id", input.organizationId)
      .eq("committee_id", input.committeeId)
      .neq("id", input.sourceAgendaItemId)
      .neq("agenda_item_thread_id", input.sourceThreadId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(250);
    if (error) throw error;

    const query = normalizedHistorySearch(input.query);
    const treatmentsByThread = new Map<
      string,
      Array<{
        item: AgendaItemHistoryLinkRecord;
        occurrence: AgendaItemHistoryLinkRecord["agenda_item_occurrences"][number];
      }>
    >();

    for (const item of data as unknown as AgendaItemHistoryLinkRecord[]) {
      for (const occurrence of item.agenda_item_occurrences) {
        if (
          occurrence.deleted_at ||
          !occurrence.meetings ||
          occurrence.meetings.deleted_at
        ) {
          continue;
        }
        const treatments =
          treatmentsByThread.get(item.agenda_item_thread_id) ?? [];
        treatments.push({ item, occurrence });
        treatmentsByThread.set(item.agenda_item_thread_id, treatments);
      }
    }

    return [...treatmentsByThread.entries()]
      .flatMap(([threadId, treatments]) => {
        const priorTreatments = treatments.filter(
          ({ occurrence }) =>
            occurrence.meetings!.starts_at <= input.beforeOrAt,
        );
        if (priorTreatments.length === 0) return [];

        const matchingTreatments = query
          ? treatments.filter(
              ({ item, occurrence }) =>
                normalizedHistorySearch(item.title).includes(query) ||
                normalizedHistorySearch(occurrence.meetings!.title).includes(
                  query,
                ),
            )
          : treatments;
        if (matchingTreatments.length === 0) return [];

        const representative = [...priorTreatments].sort((left, right) =>
          right.occurrence.meetings!.starts_at.localeCompare(
            left.occurrence.meetings!.starts_at,
          ),
        )[0];
        const normalizedTitle = normalizedHistorySearch(
          representative.item.title,
        );
        const rank = !query
          ? 0
          : normalizedTitle.startsWith(query)
            ? 0
            : normalizedTitle.includes(query)
              ? 1
              : 2;

        return [
          {
            candidate: {
              agendaItemId: representative.item.id,
              threadId,
              title: representative.item.title,
              itemType: representative.item.item_type,
              agendaItemNumber: representative.occurrence.position + 1,
              meetingId: representative.occurrence.meetings!.id,
              meetingTitle: representative.occurrence.meetings!.title,
              meetingDate: representative.occurrence.meetings!.starts_at,
              historyCount: treatments.length,
            } satisfies AgendaItemHistoryLinkCandidate,
            rank,
          },
        ];
      })
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          right.candidate.meetingDate.localeCompare(
            left.candidate.meetingDate,
          ),
      )
      .slice(0, 20)
      .map(({ candidate }) => candidate);
  }

  async linkToHistory(input: {
    organizationId: string;
    committeeId: string;
    agendaItemId: string;
    targetAgendaItemId: string;
    expectedSourceThreadId: string;
  }) {
    const { data, error } = await this.db.rpc("link_agenda_item_to_history", {
      target_organization_id: input.organizationId,
      target_committee_id: input.committeeId,
      source_agenda_item_id: input.agendaItemId,
      target_agenda_item_id: input.targetAgendaItemId,
      expected_source_thread_id: input.expectedSourceThreadId,
    });
    if (error) throw error;
    return data;
  }

  async create(input: TableInsert<"agenda_items">) {
    const { data, error } = await this.db
      .from("agenda_items")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createWithOptionalMeeting(input: {
    organizationId: string;
    committeeId: string;
    title: string;
    description: string;
    objective: string;
    itemType: Database["public"]["Enums"]["agenda_item_type"];
    targetDate: string | null;
    meetingId: string | null;
  }) {
    const createAgendaItem = () =>
      this.db.rpc("create_agenda_item", {
        target_organization_id: input.organizationId,
        target_committee_id: input.committeeId,
        agenda_title: input.title,
        agenda_description: input.description,
        agenda_objective: input.objective,
        agenda_type: input.itemType,
        // Legacy database compatibility: lifecycle_status is no longer a user workflow.
        agenda_status: input.meetingId ? "scheduled" : "backlog",
        agenda_target_date: input.targetDate,
        target_meeting_id: input.meetingId,
      });

    let { data, error } = await createAgendaItem();
    if (this.isAgendaPositionConflict(error)) {
      console.warn("Retrying agenda item creation after position conflict", {
        operation: "create_agenda_item",
        organizationId: input.organizationId,
        committeeId: input.committeeId,
        meetingId: input.meetingId,
      });
      ({ data, error } = await createAgendaItem());
      if (this.isAgendaPositionConflict(error)) {
        throw new AppError(
          "Dagsordenspunktet kunne ikke placeres i mødet, fordi rækkefølgen blev ændret samtidig. Prøv igen.",
          409,
          "AGENDA_POSITION_CONFLICT",
        );
      }
    }
    if (error) throw error;
    return data;
  }

  async schedule(input: {
    organizationId: string;
    committeeId: string;
    agendaItemId: string;
    meetingId: string;
    durationMinutes: number | null;
  }) {
    const scheduleAgendaItem = () =>
      this.db.rpc("schedule_agenda_item", {
        target_organization_id: input.organizationId,
        target_committee_id: input.committeeId,
        target_agenda_item_id: input.agendaItemId,
        target_meeting_id: input.meetingId,
        target_duration_minutes: input.durationMinutes,
      });

    let { data, error } = await scheduleAgendaItem();
    if (this.isAgendaPositionConflict(error)) {
      console.warn("Retrying agenda item scheduling after position conflict", {
        operation: "schedule_agenda_item",
        organizationId: input.organizationId,
        committeeId: input.committeeId,
        meetingId: input.meetingId,
        agendaItemId: input.agendaItemId,
      });
      ({ data, error } = await scheduleAgendaItem());
      if (this.isAgendaPositionConflict(error)) {
        throw new AppError(
          "Dagsordenspunktet kunne ikke planlægges, fordi rækkefølgen blev ændret samtidig. Prøv igen.",
          409,
          "AGENDA_POSITION_CONFLICT",
        );
      }
    }
    if (error) throw error;
    return data;
  }

  async update(agendaItemId: string, input: TableUpdate<"agenda_items">) {
    const { data, error } = await this.db
      .from("agenda_items")
      .update(input)
      .eq("id", agendaItemId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async softDelete(agendaItemId: string) {
    const { data, error } = await this.db.rpc("soft_delete_agenda_item", {
      target_agenda_item_id: agendaItemId,
    });
    if (error) throw error;
    return data;
  }

  async restore(agendaItemId: string) {
    const { data, error } = await this.db.rpc("restore_agenda_item", {
      target_agenda_item_id: agendaItemId,
    });
    if (error) throw error;
    return data;
  }

  async softDeleteOccurrence(occurrenceId: string) {
    const { data, error } = await this.db.rpc(
      "soft_delete_agenda_item_occurrence",
      { target_occurrence_id: occurrenceId },
    );
    if (error) throw error;
    return data;
  }

  async restoreOccurrence(occurrenceId: string) {
    const { data, error } = await this.db.rpc(
      "restore_agenda_item_occurrence",
      { target_occurrence_id: occurrenceId },
    );
    if (error) throw error;
    return data;
  }

  async reorderOccurrence(occurrenceId: string, direction: "up" | "down") {
    const { data, error } = await this.db.rpc(
      "reorder_agenda_item_occurrence",
      {
        target_occurrence_id: occurrenceId,
        move_direction: direction,
      },
    );
    if (error) throw error;
    return data;
  }

  async reorderMeetingOccurrences(meetingId: string, occurrenceIds: string[]) {
    const { data, error } = await this.db.rpc(
      "reorder_agenda_item_occurrences",
      {
        target_meeting_id: meetingId,
        ordered_occurrence_ids: occurrenceIds,
      },
    );
    if (error) throw error;
    return data;
  }

  async normalizeMeetingOccurrencePositions(meetingId: string) {
    const { error } = await this.db.rpc(
      "normalize_agenda_item_occurrence_positions",
      { target_meeting_id: meetingId },
    );
    if (error) throw error;
  }

  async findOccurrenceIncludingDeleted(occurrenceId: string) {
    const { data, error } = await this.db
      .from("agenda_item_occurrences")
      .select("*")
      .eq("id", occurrenceId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private activeOccurrences(item: AgendaItemWithOccurrences) {
    return {
      ...item,
      agenda_item_occurrences: item.agenda_item_occurrences.filter(
        (occurrence) => !occurrence.deleted_at,
      ),
    };
  }

  private isAgendaPositionConflict(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const candidate = error as { code?: string; message?: string };
    return (
      candidate.code === "23505" &&
      (candidate.message ?? "").includes(
        "agenda_item_occurrences_meeting_id_position_key",
      )
    );
  }
}
