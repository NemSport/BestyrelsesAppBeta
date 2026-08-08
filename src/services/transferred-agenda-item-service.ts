import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError, NotFoundError } from "@/lib/errors";
import { isOpenTransferredTask } from "@/lib/transferred-task-references";
import { scheduleTransferredAgendaItemSchema } from "@/lib/validation";
import type { PdfTransferredAgendaItemHistory } from "@/lib/meeting-document-pdf";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { TransferredAgendaItemRepository } from "@/repositories/transferred-agenda-item-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";
import type {
  IncomingTransferredAgendaItemView,
  TransferMeetingOption,
  TransferredAgendaItemView,
} from "@/types/domain";

export class TransferredAgendaItemService {
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;
  private readonly meetings: MeetingRepository;
  private readonly tasks: TaskRepository;
  private readonly transfers: TransferredAgendaItemRepository;

  constructor(db: SupabaseClient<Database>) {
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
    this.meetings = new MeetingRepository(db);
    this.tasks = new TaskRepository(db);
    this.transfers = new TransferredAgendaItemRepository(db);
  }

  async listForMeeting(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ): Promise<{
    items: TransferredAgendaItemView[];
    incomingItems: IncomingTransferredAgendaItemView[];
    futureMeetings: TransferMeetingOption[];
  }> {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const meeting = await this.meetings.findWithAgenda(meetingId);
    if (
      !meeting ||
      meeting.organization_id !== organizationId ||
      meeting.committee_id !== committeeId
    ) {
      throw new NotFoundError("Mødet");
    }

    const [transfers, incomingTransfers, futureMeetings] = await Promise.all([
      this.transfers.listBySourceMeeting(meetingId),
      this.transfers.listByTargetMeeting(meetingId),
      this.meetings.listFutureByCommittee(
        organizationId,
        committeeId,
        meeting.starts_at,
      ),
    ]);
    const agendaItems = new Map(
      meeting.agenda_item_occurrences.flatMap((occurrence) =>
        occurrence.agenda_items
          ? [[occurrence.agenda_item_id, occurrence.agenda_items] as const]
          : [],
      ),
    );
    const futureMeetingsById = new Map(
      futureMeetings.map((futureMeeting) => [futureMeeting.id, futureMeeting]),
    );

    const statusOrder = { pending: 0, scheduled: 1, dismissed: 2 } as const;
    const items = transfers
      .flatMap((transfer) => {
        const sourceAgendaItem = agendaItems.get(
          transfer.source_agenda_item_id,
        );
        if (!sourceAgendaItem) return [];
        return [
          {
            ...transfer,
            sourceMeeting: {
              id: meeting.id,
              title: meeting.title,
              starts_at: meeting.starts_at,
            },
            sourceAgendaItem: {
              id: sourceAgendaItem.id,
              title: sourceAgendaItem.title,
              item_type: sourceAgendaItem.item_type,
            },
            targetMeeting: transfer.target_meeting_id
              ? (futureMeetingsById.get(transfer.target_meeting_id) ?? null)
              : null,
          },
        ];
      })
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    const sourceAgendaItemIds = [
      ...new Set(
        incomingTransfers.map((transfer) => transfer.source_agenda_item_id),
      ),
    ];
    const [
      sourceMeetings,
      sourceAgendaItems,
      sourceOccurrences,
      sourceMinutes,
      sourceTasks,
      canEditSourceTasks,
    ] = await Promise.all([
      this.transfers.listSourceMeetings([
        ...new Set(
          incomingTransfers.map((transfer) => transfer.source_meeting_id),
        ),
      ]),
      this.transfers.listSourceAgendaItems(sourceAgendaItemIds),
      this.transfers.listSourceOccurrences(
        incomingTransfers.flatMap((transfer) =>
          transfer.source_agenda_item_occurrence_id
            ? [transfer.source_agenda_item_occurrence_id]
            : [],
        ),
      ),
      this.transfers.listSourceMinutes(
        incomingTransfers.map(
          (transfer) => transfer.source_agenda_item_minutes_id,
        ),
      ),
      this.tasks.listByAgendaItems(sourceAgendaItemIds),
      this.authorization
        .requireAgendaItemEditor(organizationId, committeeId, user.id)
        .then(() => true)
        .catch(() => false),
    ]);
    const sourceMeetingsById = new Map(
      sourceMeetings.map((sourceMeeting) => [sourceMeeting.id, sourceMeeting]),
    );
    const sourceAgendaItemsById = new Map(
      sourceAgendaItems.map((sourceAgendaItem) => [
        sourceAgendaItem.id,
        sourceAgendaItem,
      ]),
    );
    const sourceOccurrencesById = new Map(
      sourceOccurrences.map((occurrence) => [occurrence.id, occurrence]),
    );
    const sourceMinutesById = new Map(
      sourceMinutes.map((minutes) => [minutes.id, minutes]),
    );
    const sourceTasksByAgendaItemId = new Map<string, typeof sourceTasks>();
    for (const task of sourceTasks) {
      if (
        task.organization_id !== organizationId ||
        task.committee_id !== committeeId ||
        !isOpenTransferredTask(task)
      ) {
        continue;
      }
      const agendaItemTasks =
        sourceTasksByAgendaItemId.get(task.agenda_item_id ?? "") ?? [];
      agendaItemTasks.push(
        canEditSourceTasks ? task : { ...task, internal_note: null },
      );
      sourceTasksByAgendaItemId.set(task.agenda_item_id ?? "", agendaItemTasks);
    }

    return {
      items,
      incomingItems: incomingTransfers.map((transfer) => ({
        id: transfer.id,
        targetAgendaItemId: transfer.target_agenda_item_id,
        sourceStatus: transfer.source_status,
        transferReason: transfer.transfer_reason,
        targetItemType: transfer.target_item_type,
        sourceMeeting:
          sourceMeetingsById.get(transfer.source_meeting_id) ?? null,
        sourceAgendaItem:
          sourceAgendaItemsById.get(transfer.source_agenda_item_id) ?? null,
        sourceOccurrence: transfer.source_agenda_item_occurrence_id
          ? (sourceOccurrencesById.get(
              transfer.source_agenda_item_occurrence_id,
            ) ?? null)
          : null,
        sourceMinutes:
          sourceMinutesById.get(transfer.source_agenda_item_minutes_id) ?? null,
        sourceTasks:
          sourceTasksByAgendaItemId.get(transfer.source_agenda_item_id) ?? [],
      })),
      futureMeetings: futureMeetings
        .filter(({ status }) => status !== "cancelled")
        .map(({ id, title, starts_at, status }) => ({
          id,
          title,
          starts_at,
          status,
        })),
    };
  }

  async listPdfHistoryForMeeting(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ): Promise<PdfTransferredAgendaItemHistory[]> {
    const result = await this.listForMeeting(
      organizationId,
      committeeId,
      meetingId,
    );
    const transfers = await this.transfers.listByTargetMeeting(meetingId);
    const sourceAgendaItemIds = transfers.map(
      (transfer) => transfer.source_agenda_item_id,
    );
    const [sourceDecisions, sourceTasks] = await Promise.all([
      this.transfers.listSourceDecisions(sourceAgendaItemIds),
      this.transfers.listSourceTasks(sourceAgendaItemIds),
    ]);

    return result.incomingItems.flatMap((item) => {
      const minutes = item.sourceMinutes;
      if (
        !item.targetAgendaItemId ||
        !item.sourceMeeting ||
        !item.sourceAgendaItem ||
        !minutes
      ) {
        return [];
      }
      return [
        {
          targetAgendaItemId: item.targetAgendaItemId,
          transferReason: item.transferReason,
          sourceMeetingTitle: item.sourceMeeting.title,
          sourceMeetingDate: item.sourceMeeting.starts_at,
          sourceAgendaItemTitle: item.sourceAgendaItem.title,
          previousNotes: minutes.notes,
          previousDecision: minutes.decision,
          previousFollowUp: minutes.follow_up,
          previousDecisions: sourceDecisions
            .filter(
              (decision) =>
                decision.agenda_item_id === item.sourceAgendaItem!.id,
            )
            .map(({ title, description, deadline }) => ({
              title,
              description,
              deadline,
            })),
          previousTasks: sourceTasks
            .filter((task) => task.agenda_item_id === item.sourceAgendaItem!.id)
            .map(({ title, description, deadline }) => ({
              title,
              description,
              deadline,
            })),
        },
      ];
    });
  }

  async schedule(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = scheduleTransferredAgendaItemSchema.parse(input);
    const transfer = await this.transfers.findById(parsed.transferId);
    if (!transfer) throw new NotFoundError("Det overførte punkt");
    await this.authorization.requireMeetingCapability(
      transfer.organization_id,
      transfer.committee_id,
      user.id,
      "manageTransferredAgendaItems",
    );
    return this.transfers.schedule(transfer.id, parsed.meetingId ?? null);
  }

  async dismiss(transferId: string) {
    const user = await this.auth.requireUser();
    const transfer = await this.transfers.findById(transferId);
    if (!transfer) throw new NotFoundError("Det overførte punkt");
    await this.authorization.requireMeetingCapability(
      transfer.organization_id,
      transfer.committee_id,
      user.id,
      "manageTransferredAgendaItems",
    );

    if (transfer.status === "scheduled") {
      throw new AppError(
        "Et planlagt overført punkt kan ikke afvises her.",
        409,
        "TRANSFER_ALREADY_SCHEDULED",
      );
    }

    if (transfer.status === "dismissed") return transfer;
    return this.transfers.update(transfer.id, {
      status: "dismissed",
      updated_by: user.id,
    });
  }
}
