import type { SupabaseClient } from "@supabase/supabase-js";

import { hasContiguousAgendaPositions } from "@/lib/agenda-reorder";
import { AppError, NotFoundError } from "@/lib/errors";
import {
  agendaItemInputSchema,
  agendaItemHistoryCandidateSearchSchema,
  agendaItemHistoryMetadataBatchSchema,
  agendaItemHistoryLinkSchema,
  agendaItemOccurrenceBatchReorderSchema,
  agendaItemOccurrenceReorderSchema,
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
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    return this.agendaItems.listByCommittee(committeeId);
  }

  async get(organizationId: string, committeeId: string, agendaItemId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
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

  async getAgendaItemHistory(
    organizationId: string,
    committeeId: string,
    agendaItemId: string,
  ) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );

    const history = await this.agendaItems.getAgendaItemHistory({
      organizationId,
      committeeId,
      agendaItemId,
    });
    if (!history) throw new NotFoundError("Dagsordenspunktet");
    return history;
  }

  async getAgendaItemHistoryMetadataBatch(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemHistoryMetadataBatchSchema.parse(input);
    await this.authorization.requireCommitteeMember(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    return this.agendaItems.getAgendaItemHistoryMetadataBatch(parsed);
  }

  async searchHistoryLinkCandidates(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemHistoryCandidateSearchSchema.parse(input);
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "updateAgendaItem",
    );
    const source = await this.agendaItems.findWithHistory(parsed.agendaItemId);
    if (
      !source ||
      source.organization_id !== parsed.organizationId ||
      source.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Dagsordenspunktet");
    }

    const currentThreadMemberCount =
      await this.agendaItems.countActiveThreadMembers({
        organizationId: parsed.organizationId,
        committeeId: parsed.committeeId,
        threadId: source.agenda_item_thread_id,
      });
    const meetingDates = source.agenda_item_occurrences.flatMap((occurrence) =>
      occurrence.meetings?.starts_at ? [occurrence.meetings.starts_at] : [],
    );
    const beforeOrAt = meetingDates.sort().at(-1) ?? new Date().toISOString();
    const candidates =
      currentThreadMemberCount > 1
        ? []
        : await this.agendaItems.searchHistoryLinkCandidates({
            organizationId: parsed.organizationId,
            committeeId: parsed.committeeId,
            sourceAgendaItemId: source.id,
            sourceThreadId: source.agenda_item_thread_id,
            query: parsed.query,
            beforeOrAt,
          });

    return {
      currentThreadId: source.agenda_item_thread_id,
      currentThreadMemberCount,
      canLink: currentThreadMemberCount <= 1,
      candidates,
    };
  }

  async linkToHistory(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemHistoryLinkSchema.parse(input);
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "updateAgendaItem",
    );

    try {
      return await this.agendaItems.linkToHistory(parsed);
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "";
      if (message.includes("AGENDA_HISTORY_SOURCE_HAS_HISTORY")) {
        throw new AppError(
          "Dette dagsordenspunkt har allerede en historik. SammenkÃ¦dning af to eksisterende historikker understÃ¸ttes ikke endnu.",
          409,
          "AGENDA_HISTORY_MERGE_NOT_SUPPORTED",
        );
      }
      if (message.includes("AGENDA_HISTORY_CONCURRENT_CHANGE")) {
        throw new AppError(
          "Historikken blev Ã¦ndret imens du arbejdede. GenÃ¥bn dialogen og prÃ¸v igen.",
          409,
          "AGENDA_HISTORY_CONCURRENT_CHANGE",
        );
      }
      if (message.includes("AGENDA_HISTORY_SELF_LINK")) {
        throw new AppError(
          "Et dagsordenspunkt kan ikke knyttes til sig selv.",
          422,
          "AGENDA_HISTORY_SELF_LINK",
        );
      }
      if (
        message.includes("AGENDA_HISTORY_SCOPE_MISMATCH") ||
        message.includes("AGENDA_ITEM_EDITOR_REQUIRED")
      ) {
        throw new AppError(
          "Du har ikke adgang til at knytte disse dagsordenspunkter sammen.",
          403,
          "AUTHORIZATION_FAILED",
        );
      }
      if (message.includes("AGENDA_HISTORY_ITEM_NOT_FOUND")) {
        throw new NotFoundError("Dagsordenspunktet");
      }
      throw error;
    }
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemInputSchema.parse(input);
    if (parsed.meetingId) {
      await this.authorization.requireMeetingCapability(
        parsed.organizationId,
        parsed.committeeId,
        user.id,
        "scheduleAgendaItem",
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
      await this.authorization.requireMeetingCapability(
        parsed.organizationId,
        parsed.committeeId,
        user.id,
        "createAgendaItem",
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
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "updateAgendaItem",
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
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "scheduleAgendaItem",
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
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "deleteAgendaItem",
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
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "restoreAgendaItem",
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
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "deleteAgendaItem",
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

  async reorderOccurrence(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemOccurrenceReorderSchema.parse(input);
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "reorderAgendaItems",
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
    return this.agendaItems.reorderOccurrence(
      parsed.occurrenceId,
      parsed.direction,
    );
  }

  async reorderMeetingOccurrences(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemOccurrenceBatchReorderSchema.parse(input);
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "reorderAgendaItems",
    );
    const meeting = await this.meetings.findWithAgenda(parsed.meetingId);
    if (
      !meeting ||
      meeting.organization_id !== parsed.organizationId ||
      meeting.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Mødet");
    }

    const activeOccurrenceIds = new Set(
      meeting.agenda_item_occurrences
        .filter((occurrence) => !occurrence.deleted_at)
        .map((occurrence) => occurrence.id),
    );
    const requestedOccurrenceIds = new Set(parsed.occurrenceIds);
    if (
      activeOccurrenceIds.size !== parsed.occurrenceIds.length ||
      requestedOccurrenceIds.size !== parsed.occurrenceIds.length ||
      parsed.occurrenceIds.some(
        (occurrenceId) => !activeOccurrenceIds.has(occurrenceId),
      )
    ) {
      throw new AppError(
        "Rækkefølgen skal indeholde alle aktive dagsordenspunkter præcis én gang.",
        422,
        "INVALID_AGENDA_ORDER",
      );
    }

    const activeOccurrences = meeting.agenda_item_occurrences.filter(
      (occurrence) => !occurrence.deleted_at,
    );
    if (!hasContiguousAgendaPositions(activeOccurrences)) {
      await this.agendaItems.normalizeMeetingOccurrencePositions(
        parsed.meetingId,
      );
    }

    return this.agendaItems.reorderMeetingOccurrences(
      parsed.meetingId,
      parsed.occurrenceIds,
    );
  }

  async restoreOccurrence(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemOccurrenceTrashActionSchema.parse(input);
    await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "restoreAgendaItem",
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
