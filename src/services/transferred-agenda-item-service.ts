import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError, NotFoundError } from "@/lib/errors";
import { scheduleTransferredAgendaItemSchema } from "@/lib/validation";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { TransferredAgendaItemRepository } from "@/repositories/transferred-agenda-item-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";
import type {
  TransferMeetingOption,
  TransferredAgendaItemView,
} from "@/types/domain";

export class TransferredAgendaItemService {
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;
  private readonly meetings: MeetingRepository;
  private readonly transfers: TransferredAgendaItemRepository;

  constructor(db: SupabaseClient<Database>) {
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
    this.meetings = new MeetingRepository(db);
    this.transfers = new TransferredAgendaItemRepository(db);
  }

  async listForMeeting(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ): Promise<{
    items: TransferredAgendaItemView[];
    incomingItems: Array<{
      id: string;
      targetAgendaItemId: string | null;
      sourceStatus: Database["public"]["Enums"]["agenda_item_minutes_status"];
      transferReason: Database["public"]["Enums"]["agenda_item_transfer_reason"];
      targetItemType: Database["public"]["Enums"]["agenda_item_type"];
      sourceMeeting: {
        id: string;
        title: string;
        starts_at: string;
      } | null;
      sourceAgendaItem: {
        id: string;
        title: string;
        item_type: Database["public"]["Enums"]["agenda_item_type"];
      } | null;
    }>;
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
              ? futureMeetingsById.get(transfer.target_meeting_id) ?? null
              : null,
          },
        ];
      })
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    const [sourceMeetings, sourceAgendaItems] = await Promise.all([
      this.transfers.listSourceMeetings([
        ...new Set(incomingTransfers.map((transfer) => transfer.source_meeting_id)),
      ]),
      this.transfers.listSourceAgendaItems([
        ...new Set(
          incomingTransfers.map((transfer) => transfer.source_agenda_item_id),
        ),
      ]),
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

  async schedule(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = scheduleTransferredAgendaItemSchema.parse(input);
    const transfer = await this.transfers.findById(parsed.transferId);
    if (!transfer) throw new NotFoundError("Det overførte punkt");
    await this.authorization.requireCommitteeManager(
      transfer.organization_id,
      transfer.committee_id,
      user.id,
    );
    return this.transfers.schedule(
      transfer.id,
      parsed.meetingId ?? null,
    );
  }

  async dismiss(transferId: string) {
    const user = await this.auth.requireUser();
    const transfer = await this.transfers.findById(transferId);
    if (!transfer) throw new NotFoundError("Det overførte punkt");
    await this.authorization.requireCommitteeManager(
      transfer.organization_id,
      transfer.committee_id,
      user.id,
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
