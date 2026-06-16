import type { SupabaseClient } from "@supabase/supabase-js";

import { NotFoundError } from "@/lib/errors";
import {
  meetingInputSchema,
  meetingTrashActionSchema,
  meetingUpdateSchema,
} from "@/lib/validation";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class MeetingService {
  private readonly meetings: MeetingRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.meetings = new MeetingRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async list(organizationId: string, committeeId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(organizationId, committeeId, user.id);
    return this.meetings.listByCommittee(committeeId);
  }

  async get(organizationId: string, committeeId: string, meetingId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(organizationId, committeeId, user.id);
    const meeting = await this.meetings.findWithAgenda(meetingId);
    if (
      !meeting ||
      meeting.organization_id !== organizationId ||
      meeting.committee_id !== committeeId
    ) {
      throw new NotFoundError("Mødet");
    }
    return meeting;
  }

  async listAttendees(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ) {
    await this.get(organizationId, committeeId, meetingId);
    return this.meetings.listAttendees(meetingId);
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = meetingInputSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    return this.meetings.createWithStandardItems({
      organizationId: parsed.organizationId,
      committeeId: parsed.committeeId,
      title: parsed.title,
      description: parsed.description,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt ?? null,
      location: parsed.location ?? null,
    });
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = meetingUpdateSchema.parse(input);
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
    return this.meetings.update(parsed.meetingId, {
      title: parsed.title,
      description: parsed.description,
      starts_at: parsed.startsAt,
      ends_at: parsed.endsAt ?? null,
      location: parsed.location ?? null,
    });
  }

  async moveToTrash(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = meetingTrashActionSchema.parse(input);
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
    return this.meetings.softDelete(parsed.meetingId);
  }

  async restore(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = meetingTrashActionSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const meeting = await this.meetings.findIncludingDeleted(parsed.meetingId);
    if (
      !meeting ||
      meeting.organization_id !== parsed.organizationId ||
      meeting.committee_id !== parsed.committeeId ||
      !meeting.deleted_at
    ) {
      throw new NotFoundError("Mødet i papirkurven");
    }
    return this.meetings.restore(parsed.meetingId);
  }
}
