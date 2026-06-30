import type { SupabaseClient } from "@supabase/supabase-js";

import { NotFoundError } from "@/lib/errors";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  meetingParticipantsInputSchema,
  meetingInputSchema,
  meetingTrashActionSchema,
  meetingUpdateSchema,
  quickMeetingInputSchema,
} from "@/lib/validation";
import { MeetingMinutesRepository } from "@/repositories/meeting-minutes-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class MeetingService {
  private readonly meetings: MeetingRepository;
  private readonly minutes: MeetingMinutesRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.meetings = new MeetingRepository(db);
    this.minutes = new MeetingMinutesRepository(db);
    this.members = new OrganizationMemberRepository(db);
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

  async getParticipants(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ) {
    await this.get(organizationId, committeeId, meetingId);
    const [internalParticipants, externalAttendees] = await Promise.all([
      this.meetings.listAttendees(meetingId),
      this.meetings.listExternalAttendees(meetingId),
    ]);
    return { internalParticipants, externalAttendees };
  }

  async saveParticipants(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = meetingParticipantsInputSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    await this.get(parsed.organizationId, parsed.committeeId, parsed.meetingId);

    const members = await this.members.listMembers(parsed.organizationId);
    const validCommitteeMemberIds = new Set(
      members
        .filter(
          (member) =>
            member.status === "active" &&
            member.committees.some(
              (committee) => committee.id === parsed.committeeId,
            ),
        )
        .map((member) => member.user_id),
    );

    const dedupedInternal = new Map<
      string,
      (typeof parsed.internalParticipants)[number]
    >();
    for (const participant of parsed.internalParticipants) {
      if (!validCommitteeMemberIds.has(participant.userId)) {
        throw new NotFoundError("Deltageren");
      }
      dedupedInternal.set(participant.userId, participant);
    }

    const normalizedExternal = parsed.externalAttendees
      .map((attendee) => ({
        id: attendee.id,
        name: attendee.name.trim(),
        email: attendee.email?.trim() || null,
        mobile: attendee.mobile?.trim() || null,
        role_note: attendee.roleNote?.trim() || null,
      }))
      .filter((attendee) => attendee.name);

    const [internalParticipants, externalAttendees] = await Promise.all([
      this.meetings.replaceAttendees(
        parsed.meetingId,
        [...dedupedInternal.values()].map((participant) => ({
          organization_id: parsed.organizationId,
          committee_id: parsed.committeeId,
          meeting_id: parsed.meetingId,
          user_id: participant.userId,
          role: "member",
          attendance_status: participant.status,
        })),
      ),
      this.meetings.replaceExternalAttendees(
        parsed.meetingId,
        normalizedExternal.map((attendee) => ({
          id: attendee.id,
          organization_id: parsed.organizationId,
          committee_id: parsed.committeeId,
          meeting_id: parsed.meetingId,
          name: attendee.name,
          email: attendee.email,
          mobile: attendee.mobile,
          role_note: attendee.role_note,
          created_by: user.id,
          updated_by: user.id,
        })),
      ),
    ]);

    return { internalParticipants, externalAttendees };
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
