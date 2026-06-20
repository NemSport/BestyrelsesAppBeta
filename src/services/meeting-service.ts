import type { SupabaseClient } from "@supabase/supabase-js";

import { NotFoundError } from "@/lib/errors";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  meetingInputSchema,
  meetingTrashActionSchema,
  meetingUpdateSchema,
  quickMeetingInputSchema,
} from "@/lib/validation";
import { MeetingMinutesRepository } from "@/repositories/meeting-minutes-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class MeetingService {
  private readonly meetings: MeetingRepository;
  private readonly minutes: MeetingMinutesRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.meetings = new MeetingRepository(db);
    this.minutes = new MeetingMinutesRepository(db);
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

  async createQuick(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = quickMeetingInputSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );

    const meeting = await this.meetings.create({
      organization_id: parsed.organizationId,
      committee_id: parsed.committeeId,
      title: parsed.title,
      description:
        parsed.description ||
        "Hurtigt/ad hoc møde oprettet uden dagsorden via Quick Action.",
      status: "scheduled",
      starts_at: parsed.startsAt,
      ends_at: parsed.endsAt ?? null,
      location: parsed.location ?? null,
      created_by: user.id,
    });

    await this.minutes.createMeetingMinutes({
      organization_id: parsed.organizationId,
      committee_id: parsed.committeeId,
      meeting_id: meeting.id,
      minutes_text: sanitizeRichText(parsed.minutesText),
      decisions: "",
      internal_note: null,
      status: "draft",
      created_by: user.id,
      updated_by: user.id,
    });

    return meeting;
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
