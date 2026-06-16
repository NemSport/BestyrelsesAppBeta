import type { SupabaseClient } from "@supabase/supabase-js";

import { NotFoundError } from "@/lib/errors";
import {
  agendaItemInputSchema,
  agendaItemOccurrenceTrashActionSchema,
  agendaItemRemoveSchema,
  agendaItemTrashActionSchema,
  agendaItemUpdateSchema,
  scheduleAgendaItemSchema,
} from "@/lib/validation";
import { AgendaItemRepository } from "@/repositories/agenda-item-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class AgendaItemService {
  private readonly agendaItems: AgendaItemRepository;
  private readonly meetings: MeetingRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.agendaItems = new AgendaItemRepository(db);
    this.meetings = new MeetingRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async list(organizationId: string, committeeId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(organizationId, committeeId, user.id);
    return this.agendaItems.listByCommittee(committeeId);
  }

  async get(organizationId: string, committeeId: string, agendaItemId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(organizationId, committeeId, user.id);
    const agendaItem = await this.agendaItems.findWithHistory(agendaItemId);
    if (
      !agendaItem ||
      agendaItem.organization_id !== organizationId ||
      agendaItem.committee_id !== committeeId
    ) {
      throw new NotFoundError("Dagsordenspunktet");
    }
    return agendaItem;
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemInputSchema.parse(input);
    if (parsed.meetingId) {
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
    } else {
      await this.authorization.requireAgendaItemEditor(
        parsed.organizationId,
        parsed.committeeId,
        user.id,
      );
    }

    return this.agendaItems.createWithOptionalMeeting({
      organizationId: parsed.organizationId,
      committeeId: parsed.committeeId,
      title: parsed.title,
      description: parsed.description,
      objective: parsed.objective,
      itemType: parsed.itemType,
      targetDate: parsed.meetingId ? null : (parsed.targetDate ?? null),
      meetingId: parsed.meetingId ?? null,
    });
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemUpdateSchema.parse(input);
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const agendaItem = await this.agendaItems.findWithHistory(parsed.agendaItemId);
    if (
      !agendaItem ||
      agendaItem.organization_id !== parsed.organizationId ||
      agendaItem.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Dagsordenspunktet");
    }
    return this.agendaItems.update(parsed.agendaItemId, {
      title: parsed.title,
      description: parsed.description,
      objective: parsed.objective,
      item_type: parsed.itemType,
      target_date: parsed.targetDate ?? null,
    });
  }

  async schedule(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = scheduleAgendaItemSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const [agendaItem, meeting] = await Promise.all([
      this.agendaItems.findWithHistory(parsed.agendaItemId),
      this.meetings.findWithAgenda(parsed.meetingId),
    ]);
    if (
      !agendaItem ||
      agendaItem.organization_id !== parsed.organizationId ||
      agendaItem.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Dagsordenspunktet");
    }
    if (
      !meeting ||
      meeting.organization_id !== parsed.organizationId ||
      meeting.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Mødet");
    }

    return this.agendaItems.schedule({
      organizationId: parsed.organizationId,
      committeeId: parsed.committeeId,
      agendaItemId: parsed.agendaItemId,
      meetingId: parsed.meetingId,
      durationMinutes: parsed.durationMinutes ?? null,
    });
  }

  async remove(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemRemoveSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const agendaItem = await this.agendaItems.findWithHistory(
      parsed.agendaItemId,
    );
    if (
      !agendaItem ||
      agendaItem.organization_id !== parsed.organizationId ||
      agendaItem.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Dagsordenspunktet");
    }
    await this.agendaItems.softDelete(parsed.agendaItemId);
    return { removed: true, trashed: true };
  }

  async restore(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemTrashActionSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const agendaItem = await this.agendaItems.findIncludingDeleted(
      parsed.agendaItemId,
    );
    if (
      !agendaItem ||
      agendaItem.organization_id !== parsed.organizationId ||
      agendaItem.committee_id !== parsed.committeeId ||
      !agendaItem.deleted_at
    ) {
      throw new NotFoundError("Dagsordenspunktet i papirkurven");
    }
    return this.agendaItems.restore(parsed.agendaItemId);
  }

  async moveOccurrenceToTrash(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemOccurrenceTrashActionSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const occurrence = await this.agendaItems.findOccurrenceIncludingDeleted(
      parsed.occurrenceId,
    );
    if (
      !occurrence ||
      occurrence.organization_id !== parsed.organizationId ||
      occurrence.committee_id !== parsed.committeeId ||
      occurrence.deleted_at
    ) {
      throw new NotFoundError("Dagsordensforekomsten");
    }
    return this.agendaItems.softDeleteOccurrence(parsed.occurrenceId);
  }

  async restoreOccurrence(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemOccurrenceTrashActionSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const occurrence = await this.agendaItems.findOccurrenceIncludingDeleted(
      parsed.occurrenceId,
    );
    if (
      !occurrence ||
      occurrence.organization_id !== parsed.organizationId ||
      occurrence.committee_id !== parsed.committeeId ||
      !occurrence.deleted_at
    ) {
      throw new NotFoundError("Dagsordensforekomsten i papirkurven");
    }
    return this.agendaItems.restoreOccurrence(parsed.occurrenceId);
  }
}
