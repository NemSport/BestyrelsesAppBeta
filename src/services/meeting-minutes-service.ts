import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError, AuthorizationError, NotFoundError } from "@/lib/errors";
import { getAgendaItemTransferRule } from "@/lib/agenda-item-minutes";
import { formatDanishDateKey, formatDanishDateTime } from "@/lib/date-format";
import { generateMeetingMinutesPdf } from "@/lib/minutes-pdf";
import type { PdfReportAttachment } from "@/lib/pdf-report";
import { richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";
import {
  agendaItemPrivateNoteInputSchema,
  agendaItemMinutesInputSchema,
  markNoResponseSchema,
  meetingMinutesInputSchema,
  meetingMinutesReferentActionSchema,
  minutesApprovalResponseSchema,
  sendMinutesForApprovalSchema,
} from "@/lib/validation";
import { MeetingMinutesGovernanceRepository } from "@/repositories/meeting-minutes-governance-repository";
import { MeetingMinutesRepository } from "@/repositories/meeting-minutes-repository";
import { DecisionRepository } from "@/repositories/decision-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { OrganizationRepository } from "@/repositories/organization-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { TransferredAgendaItemRepository } from "@/repositories/transferred-agenda-item-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import {
  EmailService,
  type EmailDeliveryStatus,
} from "@/services/email-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";
import type { Database } from "@/types/database";
import type {
  MeetingMinutesReferentLock,
  MeetingWithAgenda,
  TaskView,
} from "@/types/domain";

const REFERENT_LEASE_SECONDS = 90;

type RawMinuteAttachment =
  | Database["public"]["Tables"]["meeting_minute_attachments"]["Row"]
  | Database["public"]["Tables"]["agenda_item_minute_attachments"]["Row"];

type ApprovalEmailResult = {
  status: EmailDeliveryStatus;
  mode: "stub" | "resend";
  recipientCount: number;
  sent: number;
  successfulCount: number;
  failed: number;
  failedCount: number;
  stubbed: number;
  skippedMissingConfig: number;
  warning: string | null;
  errors: string[];
};

type MeetingMinutesReferentLockView = MeetingMinutesReferentLock & {
  memberName: string;
  memberEmail: string;
  isCurrentUser: boolean;
  isExpired: boolean;
  claimed?: boolean;
};

function attachmentEmbedType(fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedName = fileName.toLowerCase();
  if (
    normalizedMimeType === "application/pdf" ||
    normalizedName.endsWith(".pdf")
  ) {
    return "pdf" as const;
  }
  if (normalizedMimeType === "image/png" || normalizedName.endsWith(".png")) {
    return "png" as const;
  }
  if (
    ["image/jpeg", "image/jpg", "image/pjpeg"].includes(normalizedMimeType) ||
    normalizedName.endsWith(".jpg") ||
    normalizedName.endsWith(".jpeg")
  ) {
    return "jpg" as const;
  }
  return "unsupported" as const;
}

export class MeetingMinutesService {
  private readonly minutes: MeetingMinutesRepository;
  private readonly governance: MeetingMinutesGovernanceRepository;
  private readonly meetings: MeetingRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly organizations: OrganizationRepository;
  private readonly decisions: DecisionRepository;
  private readonly tasks: TaskRepository;
  private readonly transfers: TransferredAgendaItemRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.minutes = new MeetingMinutesRepository(db);
    this.governance = new MeetingMinutesGovernanceRepository(db);
    this.meetings = new MeetingRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.organizations = new OrganizationRepository(db);
    this.decisions = new DecisionRepository(db);
    this.tasks = new TaskRepository(db);
    this.transfers = new TransferredAgendaItemRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  private async requireMeeting(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ) {
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

  private requireOccurrence(
    meeting: MeetingWithAgenda,
    agendaItemId: string,
    occurrenceId: string | null,
  ) {
    const occurrence = meeting.agenda_item_occurrences.find(
      (candidate) =>
        candidate.agenda_item_id === agendaItemId &&
        (!occurrenceId || candidate.id === occurrenceId),
    );
    if (!occurrence) {
      throw new NotFoundError("Dagsordenspunktet på mødet");
    }
    return occurrence;
  }

  private hasMeetingMinutesContent(
    meetingMinutes: Awaited<
      ReturnType<MeetingMinutesRepository["findMeetingMinutes"]>
    >,
    agendaItemMinutes: Awaited<
      ReturnType<MeetingMinutesRepository["listAgendaItemMinutes"]>
    >,
  ) {
    if (
      richTextToPlainText(meetingMinutes?.minutes_text).trim() ||
      richTextToPlainText(meetingMinutes?.decisions).trim()
    ) {
      return true;
    }

    return agendaItemMinutes.some(
      (minutes) =>
        richTextToPlainText(minutes.notes).trim() ||
        richTextToPlainText(minutes.decision).trim() ||
        richTextToPlainText(minutes.follow_up).trim(),
    );
  }

  private async ensureMeetingMinutesForApproval(input: {
    organizationId: string;
    committeeId: string;
    meetingId: string;
    userId: string;
  }) {
    const [existingMinutes, agendaItemMinutes] = await Promise.all([
      this.minutes.findMeetingMinutes(input.meetingId),
      this.minutes.listAgendaItemMinutes(input.meetingId),
    ]);

    if (!this.hasMeetingMinutesContent(existingMinutes, agendaItemMinutes)) {
      throw new AppError(
        "Referatet er tomt og kan ikke sendes til godkendelse.",
        422,
        "EMPTY_MEETING_MINUTES",
      );
    }

    if (existingMinutes) return existingMinutes;

    console.info("[meeting-minutes] Opretter draft-referat før godkendelse.", {
      operation: "ensure_meeting_minutes_for_approval",
      organizationId: input.organizationId,
      committeeId: input.committeeId,
      meetingId: input.meetingId,
      agendaItemMinutesCount: agendaItemMinutes.length,
    });

    try {
      return await this.minutes.createMeetingMinutes({
        organization_id: input.organizationId,
        committee_id: input.committeeId,
        meeting_id: input.meetingId,
        minutes_text: "",
        decisions: "",
        internal_note: null,
        status: "draft",
        created_by: input.userId,
        updated_by: input.userId,
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        const minutes = await this.minutes.findMeetingMinutes(input.meetingId);
        if (minutes) return minutes;
      }
      throw error;
    }
  }

  private toReferentLockView(
    lock: Awaited<ReturnType<MeetingMinutesRepository["findReferentLock"]>>,
    currentUserId: string,
    claimed?: boolean,
  ): MeetingMinutesReferentLockView | null {
    if (!lock) return null;
    const { profiles: profile, ...lockFields } = lock;
    return {
      ...lockFields,
      memberName:
        profile?.full_name || "Ukendt referent",
	memberEmail: "",
      isCurrentUser: lock.user_id === currentUserId,
      isExpired: new Date(lock.expires_at).getTime() <= Date.now(),
      claimed,
    };
  }

  private async requireActiveReferent(meetingId: string, userId: string) {
    const lock = await this.minutes.findReferentLock(meetingId);
    const view = this.toReferentLockView(lock, userId);
    if (!view || view.isExpired) {
      throw new AuthorizationError(
        "Tag rollen som referent, før du redigerer de officielle referatfelter.",
      );
    }
    if (!view.isCurrentUser) {
      throw new AuthorizationError(
        `Referatfelterne er låst, fordi ${view.memberName} er referent.`,
      );
    }
  }

  async get(organizationId: string, committeeId: string, meetingId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    await this.requireMeeting(organizationId, committeeId, meetingId);

    const [
      meetingMinutes,
      agendaItemMinutes,
      privateAgendaItemNotes,
      members,
      referentLock,
    ] = await Promise.all([
        this.minutes.findMeetingMinutes(meetingId),
        this.minutes.listAgendaItemMinutes(meetingId),
        this.minutes.listPrivateAgendaItemNotes(meetingId, user.id),
        this.members.listMembers(organizationId),
        this.minutes.findReferentLock(meetingId),
      ]);

    const [approvals, meetingAttachments, agendaItemAttachments, canApprove] =
      meetingMinutes
        ? await Promise.all([
            this.governance.listApprovals(meetingMinutes.id),
            this.governance.listMeetingAttachments(meetingMinutes.id),
            this.governance.listAgendaItemAttachments(meetingId),
            this.governance.canApprove(meetingMinutes.id),
          ])
        : [[], [], [], false];
    const membersById = new Map(
      members.map((member) => [member.user_id, member]),
    );
    const attachmentView = (
      attachment:
        | Database["public"]["Tables"]["meeting_minute_attachments"]["Row"]
        | Database["public"]["Tables"]["agenda_item_minute_attachments"]["Row"],
    ) => ({
      id: attachment.id,
      meetingId: attachment.meeting_id,
      agendaItemId:
        "agenda_item_id" in attachment ? attachment.agenda_item_id : null,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      fileSize: attachment.file_size,
      uploadedBy: attachment.uploaded_by,
      uploadedByName:
        membersById.get(attachment.uploaded_by)?.full_name ||
        membersById.get(attachment.uploaded_by)?.email ||
        "Ukendt medlem",
      createdAt: attachment.created_at,
    });

    return {
      meetingMinutes,
      referentLock: this.toReferentLockView(referentLock, user.id),
      agendaItemMinutes,
      privateAgendaItemNotes,
      responsiblePeople: members
        .filter((member) => member.status === "active")
        .map((member) => ({
          id: member.user_id,
          name: member.full_name || member.email,
          email: member.email,
        })),
      approvals: approvals.map((approval) => ({
        ...approval,
        memberName:
          membersById.get(approval.user_id)?.full_name ||
          membersById.get(approval.user_id)?.email ||
          "Ukendt medlem",
        memberEmail: membersById.get(approval.user_id)?.email || "",
      })),
      meetingAttachments: meetingAttachments.map(attachmentView),
      agendaItemAttachments: agendaItemAttachments.map(attachmentView),
      canApprove,
    };
  }

  async getPreviousMeetingReference(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const currentMeeting = await this.requireMeeting(
      organizationId,
      committeeId,
      meetingId,
    );
    const previousMeeting = await this.meetings.findPreviousWithAgenda(
      organizationId,
      committeeId,
      currentMeeting.starts_at,
    );

    if (!previousMeeting) {
      return {
        meeting: null,
        minutes: null,
        agendaItemMinutes: [],
      };
    }

    const [meetingMinutes, agendaItemMinutes] = await Promise.all([
      this.minutes.findMeetingMinutes(previousMeeting.id),
      this.minutes.listAgendaItemMinutes(previousMeeting.id),
    ]);
    const minutesByAgendaItem = new Map(
      agendaItemMinutes.map((minutes) => [minutes.agenda_item_id, minutes]),
    );

    return {
      meeting: {
        id: previousMeeting.id,
        title: previousMeeting.title,
        starts_at: previousMeeting.starts_at,
      },
      minutes: meetingMinutes
        ? {
            status: meetingMinutes.status,
            minutes_text: meetingMinutes.minutes_text,
            decisions: meetingMinutes.decisions,
          }
        : null,
      agendaItemMinutes: previousMeeting.agenda_item_occurrences.flatMap(
        (occurrence) => {
          const item = occurrence.agenda_items;
          const minutes = minutesByAgendaItem.get(occurrence.agenda_item_id);
          if (!item || !minutes) return [];
          return [
            {
              id: minutes.id,
              position: occurrence.position,
              title: item.title,
              itemType: item.item_type,
              notes: minutes.notes,
              decision: minutes.decision,
              followUp: minutes.follow_up,
            },
          ];
        },
      ),
    };
  }

  async saveMeetingMinutes(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = meetingMinutesInputSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    await this.requireMeeting(
      parsed.organizationId,
      parsed.committeeId,
      parsed.meetingId,
    );
    await this.requireActiveReferent(parsed.meetingId, user.id);

    const existing = await this.minutes.findMeetingMinutes(parsed.meetingId);
    if (parsed.status === "approved" && existing?.status !== "approved") {
      throw new AppError(
        "Referatet skal godkendes gennem godkendelsesflowet.",
        422,
        "APPROVAL_FLOW_REQUIRED",
      );
    }
    const values = {
      minutes_text: sanitizeRichText(parsed.minutesText),
      decisions: sanitizeRichText(parsed.decisions),
      internal_note: parsed.internalNote
        ? sanitizeRichText(parsed.internalNote)
        : null,
      status: parsed.status,
      updated_by: user.id,
    };

    if (existing) {
      const updated = await this.minutes.updateMeetingMinutes(
        existing.id,
        values,
        parsed.expectedUpdatedAt ?? undefined,
      );
      if (!updated) {
        throw new AppError(
          "Referatet er ændret af en anden bruger. Din lokale tekst er ikke overskrevet. Genindlæs eller sammenlign versionerne, før du gemmer igen.",
          409,
          "MINUTES_VERSION_CONFLICT",
        );
      }
      return updated;
    }

    return this.minutes.createMeetingMinutes({
      organization_id: parsed.organizationId,
      committee_id: parsed.committeeId,
      meeting_id: parsed.meetingId,
      ...values,
      created_by: user.id,
    });
  }

  async saveAgendaItemMinutes(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemMinutesInputSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const meeting = await this.requireMeeting(
      parsed.organizationId,
      parsed.committeeId,
      parsed.meetingId,
    );
    const occurrence = this.requireOccurrence(
      meeting,
      parsed.agendaItemId,
      parsed.agendaItemOccurrenceId ?? null,
    );
    await this.requireActiveReferent(parsed.meetingId, user.id);
    if (
      !occurrence.agenda_items ||
      occurrence.agenda_items.item_type !== parsed.itemType
    ) {
      throw new AppError(
        "Dagsordenspunktets type er ændret. Genindlæs siden og prøv igen.",
        409,
        "AGENDA_ITEM_TYPE_CHANGED",
      );
    }

    if (parsed.responsibleUserId) {
      const responsibleMembership = await this.organizations.getMembership(
        parsed.organizationId,
        parsed.responsibleUserId,
      );
      if (!responsibleMembership) {
        throw new AppError(
          "Den ansvarlige skal være et aktivt medlem af organisationen.",
          422,
          "INVALID_RESPONSIBLE_PERSON",
        );
      }
    }

    const existing = await this.minutes.findAgendaItemMinutes(
      parsed.meetingId,
      parsed.agendaItemId,
    );
    const values = {
      agenda_item_occurrence_id: occurrence.id,
      notes: sanitizeRichText(parsed.notes),
      decision: sanitizeRichText(parsed.decision),
      follow_up: sanitizeRichText(parsed.followUp),
      responsible_user_id: parsed.responsibleUserId || null,
      deadline: parsed.deadline || null,
      status: parsed.status,
      updated_by: user.id,
    };

    const savedMinutes = existing
      ? await this.minutes.updateAgendaItemMinutes(
          existing.id,
          values,
          parsed.expectedUpdatedAt ?? undefined,
        )
      : await this.minutes.createAgendaItemMinutes({
          organization_id: parsed.organizationId,
          committee_id: parsed.committeeId,
          meeting_id: parsed.meetingId,
          agenda_item_id: parsed.agendaItemId,
          ...values,
          created_by: user.id,
        });

    if (!savedMinutes) {
      throw new AppError(
        "Punktreferatet er ændret af en anden bruger. Din lokale tekst er ikke overskrevet. Genindlæs eller sammenlign versionerne, før du gemmer igen.",
        409,
        "AGENDA_MINUTES_VERSION_CONFLICT",
      );
    }

    const transferRule = getAgendaItemTransferRule(
      parsed.itemType,
      parsed.status,
    );
    const pendingTransfers = await this.transfers.listPendingBySourceMinutes(
      savedMinutes.id,
    );
    await this.transfers.deleteByIds(
      pendingTransfers
        .filter(
          (transfer) =>
            !transferRule ||
            transfer.source_status !== transferRule.status ||
            transfer.target_item_type !== transferRule.targetType,
        )
        .map((transfer) => transfer.id),
    );

    if (transferRule) {
      await this.transfers.createIfMissing({
        organization_id: parsed.organizationId,
        committee_id: parsed.committeeId,
        source_meeting_id: parsed.meetingId,
        source_agenda_item_id: parsed.agendaItemId,
        source_agenda_item_occurrence_id: occurrence.id,
        source_agenda_item_minutes_id: savedMinutes.id,
        transfer_reason: transferRule.reason,
        source_status: transferRule.status,
        target_item_type: transferRule.targetType,
        created_by: user.id,
        updated_by: user.id,
      });
    }

    return savedMinutes;
  }

  async updateReferentLock(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = meetingMinutesReferentActionSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    await this.requireMeeting(
      parsed.organizationId,
      parsed.committeeId,
      parsed.meetingId,
    );

    if (parsed.action === "claim") {
      const result = await this.minutes.claimReferent(
        parsed.meetingId,
        REFERENT_LEASE_SECONDS,
      );
      const lock = await this.minutes.findReferentLock(parsed.meetingId);
      const view = this.toReferentLockView(lock, user.id, result.claimed);
      return {
        lock: view,
        claimed: result.claimed,
        message: result.claimed
          ? "Du er nu referent."
          : `${view?.memberName ?? "En anden bruger"} er allerede referent.`,
      };
    }

    if (parsed.action === "heartbeat") {
      const renewed = await this.minutes.heartbeatReferent(
        parsed.meetingId,
        REFERENT_LEASE_SECONDS,
      );
      if (!renewed) {
        return {
          lock: null,
          claimed: false,
          message: "Referentrollen kunne ikke fornyes.",
        };
      }
      const lock = await this.minutes.findReferentLock(parsed.meetingId);
      return {
        lock: this.toReferentLockView(lock, user.id, true),
        claimed: true,
        message: "Referentrollen er fornyet.",
      };
    }

    await this.minutes.releaseReferent(parsed.meetingId);
    return {
      lock: null,
      claimed: false,
      message: "Referentrollen er afgivet.",
    };
  }

  async savePrivateAgendaItemNote(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = agendaItemPrivateNoteInputSchema.parse(input);
    await this.authorization.requireCommitteeMember(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    const meeting = await this.requireMeeting(
      parsed.organizationId,
      parsed.committeeId,
      parsed.meetingId,
    );
    this.requireOccurrence(meeting, parsed.agendaItemId, null);

    const existing = await this.minutes.findPrivateAgendaItemNote(
      parsed.meetingId,
      parsed.agendaItemId,
      user.id,
    );
    const values = {
      content: sanitizeRichText(parsed.content),
    };

    const savedNote = existing
      ? await this.minutes.updatePrivateAgendaItemNote(
          existing.id,
          values,
          parsed.expectedUpdatedAt ?? undefined,
        )
      : await this.minutes.createPrivateAgendaItemNote({
          organization_id: parsed.organizationId,
          committee_id: parsed.committeeId,
          meeting_id: parsed.meetingId,
          agenda_item_id: parsed.agendaItemId,
          user_id: user.id,
          ...values,
        });

    if (!savedNote) {
      throw new AppError(
        "Din interne note er ændret i en anden fane. Den lokale tekst er ikke overskrevet.",
        409,
        "PRIVATE_NOTE_VERSION_CONFLICT",
      );
    }

    return savedNote;
  }

  async sendForApproval(input: unknown, options: { appUrl?: string } = {}) {
    const user = await this.auth.requireUser();
    const parsed = sendMinutesForApprovalSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    await this.requireMeeting(
      parsed.organizationId,
      parsed.committeeId,
      parsed.meetingId,
    );
    const [registeredAttendees, approvalMembers] = await Promise.all([
      this.meetings.listAttendees(parsed.meetingId),
      this.members.listMembers(parsed.organizationId),
    ]);
    const registeredParticipantsCount = registeredAttendees.filter((attendee) =>
      ["accepted", "attended", "absent", "excused"].includes(
        attendee.attendance_status,
      ),
    ).length;
    const presentInternalParticipantsCount = registeredAttendees.filter(
      (attendee) =>
        attendee.attendance_status === "accepted" ||
        attendee.attendance_status === "attended",
    ).length;
    const fallbackMemberCount = approvalMembers.filter(
      (member) =>
        member.status === "active" &&
        member.committees.some(
          (committee) =>
            committee.id === parsed.committeeId &&
            ["chair", "secretary", "member"].includes(committee.role),
        ),
    ).length;
    console.info("[meeting-minutes] Approval recipient selection before RPC", {
      operation: "send_minutes_for_approval",
      organizationId: parsed.organizationId,
      committeeId: parsed.committeeId,
      meetingId: parsed.meetingId,
      registeredParticipantsCount,
      presentInternalParticipantsCount,
      fallbackMemberCount,
      expectedRecipientMode:
        registeredParticipantsCount > 0 ? "participants" : "fallback",
      expectedRecipientCount:
        registeredParticipantsCount > 0
          ? presentInternalParticipantsCount
          : fallbackMemberCount,
    });
    const minutes = await this.ensureMeetingMinutesForApproval({
      organizationId: parsed.organizationId,
      committeeId: parsed.committeeId,
      meetingId: parsed.meetingId,
      userId: user.id,
    });
    if (parsed.deadline < new Date().toISOString().slice(0, 10)) {
      throw new AppError(
        "Godkendelsesfristen kan ikke ligge i fortiden.",
        422,
        "INVALID_APPROVAL_DEADLINE",
      );
    }
    const updatedMinutes = await this.governance.sendForApproval(
      minutes.id,
      parsed.deadline,
    );
    const approvalRows = await this.governance.listApprovals(minutes.id);
    console.info("[meeting-minutes] Approval recipient selection after RPC", {
      operation: "send_minutes_for_approval",
      organizationId: parsed.organizationId,
      committeeId: parsed.committeeId,
      meetingId: parsed.meetingId,
      meetingMinutesId: minutes.id,
      finalRecipientCount: approvalRows.length,
    });

    const emailResult = await this.sendApprovalEmails({
      organizationId: parsed.organizationId,
      committeeId: parsed.committeeId,
      meetingId: parsed.meetingId,
      appUrl: options.appUrl,
    }).catch((error) => {
      console.error("[meeting-minutes] Referatmail kunne ikke sendes.", {
        organizationId: parsed.organizationId,
        committeeId: parsed.committeeId,
        meetingId: parsed.meetingId,
        minutesId: minutes.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "failed" as const,
        sent: 0,
        successfulCount: 0,
        failed: 1,
        failedCount: 1,
        stubbed: 0,
        skippedMissingConfig: 0,
        mode: "stub" as const,
        recipientCount: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        warning:
          "Referatet blev sendt til godkendelse, men emailen kunne ikke sendes.",
      };
    });

    return { minutes: updatedMinutes, email: emailResult };
  }

  async respondToApproval(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = minutesApprovalResponseSchema.parse(input);
    await this.authorization.requireCommitteeMember(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    await this.requireMeeting(
      parsed.organizationId,
      parsed.committeeId,
      parsed.meetingId,
    );
    const minutes = await this.minutes.findMeetingMinutes(parsed.meetingId);
    if (!minutes) throw new NotFoundError("Referatet");
    if (!(await this.governance.canApprove(minutes.id))) {
      throw new AuthorizationError(
        "Du er ikke blandt de medlemmer, der skal godkende referatet.",
      );
    }
    return this.governance.respond(
      minutes.id,
      parsed.status,
      parsed.comment ?? null,
    );
  }

  async markNoResponse(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = markNoResponseSchema.parse(input);
    await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    await this.requireMeeting(
      parsed.organizationId,
      parsed.committeeId,
      parsed.meetingId,
    );
    const minutes = await this.minutes.findMeetingMinutes(parsed.meetingId);
    if (!minutes) throw new NotFoundError("Referatet");
    if (
      !minutes.approval_deadline ||
      minutes.approval_deadline >= new Date().toISOString().slice(0, 10)
    ) {
      throw new AppError(
        "Godkendelsesfristen er ikke overskredet endnu.",
        422,
        "APPROVAL_DEADLINE_NOT_PASSED",
      );
    }
    return this.governance.markNoResponse(minutes.id);
  }

  async uploadAttachment(input: {
    organizationId: string;
    committeeId: string;
    meetingId: string;
    agendaItemId?: string | null;
    file: File;
  }) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeManager(
      input.organizationId,
      input.committeeId,
      user.id,
    );
    await this.requireMeeting(
      input.organizationId,
      input.committeeId,
      input.meetingId,
    );
    if (!input.file.name || input.file.size === 0) {
      throw new AppError("Vælg en fil, der skal vedhæftes.", 422, "EMPTY_FILE");
    }
    if (input.file.size > 25 * 1024 * 1024) {
      throw new AppError("Filen må højst fylde 25 MB.", 422, "FILE_TOO_LARGE");
    }
    const blockedExtensions = /\.(?:html?|svg|js|mjs|exe|com|bat|cmd|ps1)$/i;
    const blockedMimeTypes = new Set([
      "text/html",
      "image/svg+xml",
      "application/javascript",
      "text/javascript",
      "application/x-msdownload",
    ]);
    if (
      blockedExtensions.test(input.file.name) ||
      blockedMimeTypes.has(input.file.type)
    ) {
      throw new AppError(
        "Denne filtype kan ikke vedhæftes.",
        422,
        "UNSAFE_FILE_TYPE",
      );
    }

    const meetingMinutes = await this.minutes.findMeetingMinutes(
      input.meetingId,
    );
    if (!meetingMinutes) {
      throw new AppError(
        "Gem mødereferatet, før du vedhæfter filer.",
        422,
        "MINUTES_REQUIRED",
      );
    }

    const safeName =
      input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-160) ||
      "vedhaeftning";
    const attachmentId = crypto.randomUUID();
    const scope = input.agendaItemId
      ? `agenda/${input.agendaItemId}`
      : `meeting/${meetingMinutes.id}`;
    const storagePath = `${input.organizationId}/${input.committeeId}/${input.meetingId}/${scope}/${attachmentId}-${safeName}`;

    let uploaded = false;
    try {
      await this.governance.upload(storagePath, input.file);
      uploaded = true;
      if (input.agendaItemId) {
        const agendaMinutes = await this.minutes.findAgendaItemMinutes(
          input.meetingId,
          input.agendaItemId,
        );
        if (!agendaMinutes) {
          throw new AppError(
            "Gem punktreferatet, før du vedhæfter filer.",
            422,
            "AGENDA_MINUTES_REQUIRED",
          );
        }
        return await this.governance.createAgendaItemAttachment({
          id: attachmentId,
          organization_id: input.organizationId,
          committee_id: input.committeeId,
          meeting_id: input.meetingId,
          agenda_item_id: input.agendaItemId,
          agenda_item_minutes_id: agendaMinutes.id,
          storage_path: storagePath,
          file_name: input.file.name,
          mime_type: input.file.type || "application/octet-stream",
          file_size: input.file.size,
          uploaded_by: user.id,
          created_by: user.id,
          updated_by: user.id,
        });
      }

      return await this.governance.createMeetingAttachment({
        id: attachmentId,
        organization_id: input.organizationId,
        committee_id: input.committeeId,
        meeting_id: input.meetingId,
        meeting_minutes_id: meetingMinutes.id,
        storage_path: storagePath,
        file_name: input.file.name,
        mime_type: input.file.type || "application/octet-stream",
        file_size: input.file.size,
        uploaded_by: user.id,
        created_by: user.id,
        updated_by: user.id,
      });
    } catch (error) {
      if (uploaded) {
        await this.governance.removeUpload(storagePath).catch(() => undefined);
      }
      throw error;
    }
  }
  async getAttachmentDownload(attachmentId: string, download = false) {
    await this.auth.requireUser();
    const attachment = await this.governance.findAttachment(attachmentId);
    if (!attachment) throw new NotFoundError("Vedhæftningen");
    return {
      url: await this.governance.createDownloadUrl(
        attachment.storage_path,
        download ? attachment.file_name : null,
      ),
      fileName: attachment.file_name,
    };
  }

  async removeAttachment(attachmentId: string) {
    const user = await this.auth.requireUser();
    const attachment = await this.governance.findAttachment(attachmentId);
    if (!attachment) throw new NotFoundError("Vedhæftningen");

    await this.authorization.requireCommitteeManager(
      attachment.organization_id,
      attachment.committee_id,
      user.id,
    );
    await this.requireMeeting(
      attachment.organization_id,
      attachment.committee_id,
      attachment.meeting_id,
    );

    if ("agenda_item_id" in attachment) {
      const meeting = await this.requireMeeting(
        attachment.organization_id,
        attachment.committee_id,
        attachment.meeting_id,
      );
      this.requireOccurrence(meeting, attachment.agenda_item_id, null);
      await this.governance.deleteAgendaItemAttachment(attachment.id);
    } else {
      await this.governance.deleteMeetingAttachment(attachment.id);
    }

    await this.governance
      .removeUpload(attachment.storage_path)
      .catch((error) => {
        console.warn(
          "[meeting-minutes] Bilag blev fjernet fra databasen, men storage-filen kunne ikke slettes.",
          {
            meetingId: attachment.meeting_id,
            agendaItemId:
              "agenda_item_id" in attachment ? attachment.agenda_item_id : null,
            attachmentId: attachment.id,
            fileName: attachment.file_name,
            mimeType: attachment.mime_type,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      });

    return { id: attachment.id, fileName: attachment.file_name };
  }

  async getPdfAttachments(
    organizationId: string,
    committeeId: string,
    meetingId: string,
    options: { includeMeetingAttachments?: boolean } = {},
  ): Promise<PdfReportAttachment[]> {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const meeting = await this.requireMeeting(
      organizationId,
      committeeId,
      meetingId,
    );
    const meetingMinutes = await this.minutes.findMeetingMinutes(meetingId);
    const [meetingAttachments, agendaItemAttachments] = await Promise.all([
      options.includeMeetingAttachments && meetingMinutes
        ? this.governance.listMeetingAttachments(meetingMinutes.id)
        : Promise.resolve([]),
      this.governance.listAgendaItemAttachments(meetingId),
    ]);

    const occurrenceByAgendaItemId = new Map(
      meeting.agenda_item_occurrences.map((occurrence, index) => [
        occurrence.agenda_item_id,
        { occurrence, displayNumber: index + 1 },
      ]),
    );

    const ordered = [
      ...meetingAttachments.map((attachment) => ({
        attachment,
        sortPosition: -1,
        pointLabel: "Møde",
        agendaItemId: null as string | null,
      })),
      ...agendaItemAttachments
        .filter((attachment) =>
          occurrenceByAgendaItemId.has(attachment.agenda_item_id),
        )
        .map((attachment) => {
          const occurrenceEntry = occurrenceByAgendaItemId.get(
            attachment.agenda_item_id,
          )!;
          return {
            attachment,
            sortPosition: occurrenceEntry.occurrence.position,
            pointLabel: `Punkt ${occurrenceEntry.displayNumber}`,
            agendaItemId: attachment.agenda_item_id,
          };
        }),
    ].sort((left, right) => {
      if (left.sortPosition !== right.sortPosition) {
        return left.sortPosition - right.sortPosition;
      }
      const nameComparison = left.attachment.file_name.localeCompare(
        right.attachment.file_name,
        "da-DK",
      );
      if (nameComparison !== 0) return nameComparison;
      return left.attachment.created_at.localeCompare(
        right.attachment.created_at,
      );
    });

    const result: PdfReportAttachment[] = [];
    for (const entry of ordered) {
      const attachment = entry.attachment as RawMinuteAttachment;
      const embedType = attachmentEmbedType(
        attachment.file_name,
        attachment.mime_type,
      );
      let bytes: Uint8Array | null = null;
      if (embedType !== "unsupported") {
        try {
          bytes = await this.governance.download(attachment.storage_path);
        } catch (error) {
          console.warn("[meeting-minutes] Bilag kunne ikke hentes til PDF.", {
            meetingId,
            agendaItemId: entry.agendaItemId,
            attachmentId: attachment.id,
            fileName: attachment.file_name,
            mimeType: attachment.mime_type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      result.push({
        appendixNumber: result.length + 1,
        pointLabel: entry.pointLabel,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        bytes,
        embedType,
      });
    }

    return result;
  }

  private toApprovalEmailTask(
    task: TaskView,
    organizationId: string,
    fallbackUrl: string,
  ) {
    const relation = task.agendaItem?.title
      ? `Punkt: ${task.agendaItem.title}`
      : task.decision?.title
        ? `Beslutning: ${task.decision.title}`
        : task.meeting?.title
          ? `Møde: ${task.meeting.title}`
          : null;
    return {
      id: task.id,
      title: task.title,
      deadline: task.deadline,
      status: task.status,
      relation,
      url: `${fallbackUrl.replace(/\/committees\/[^/]+\/meetings\/[^/]+$/, "")}/tasks?editTask=${task.id}#task-${task.id}`,
    };
  }

  private async sendApprovalEmails({
    organizationId,
    committeeId,
    meetingId,
    appUrl,
  }: {
    organizationId: string;
    committeeId: string;
    meetingId: string;
    appUrl?: string;
  }) {
    const data = await this.getApprovedPdfData(
      organizationId,
      committeeId,
      meetingId,
      {
        allowReadyForApproval: true,
      },
    );
    const root = (appUrl || process.env.NEXT_PUBLIC_APP_URL || "").replace(
      /\/$/,
      "",
    );
    const meetingUrl = root
      ? `${root}/organizations/${organizationId}/committees/${committeeId}/meetings/${meetingId}`
      : `/organizations/${organizationId}/committees/${committeeId}/meetings/${meetingId}`;
    const brandingService = new OrganizationBrandingService(this.db);
    const [pdfBranding, emailBranding, attachmentsForPdf] =
      await Promise.all([
        brandingService.getPdfBranding(
          data.organization.id,
          data.organization.name,
        ),
        brandingService.getEmailBranding(
          data.organization.id,
          data.organization.name,
        ),
        this.getPdfAttachments(organizationId, committeeId, meetingId, {
          includeMeetingAttachments: true,
        }),
      ]);

    const pdf = await generateMeetingMinutesPdf({
      meeting: data.meeting,
      committeeName: data.committee.name,
      meetingMinutes: data.meetingMinutes!,
      agendaItemMinutes: data.agendaItemMinutes,
      decisions: data.decisions,
      tasks: data.tasks,
      approvals: data.approvals,
      attachments: [...data.meetingAttachments, ...data.agendaItemAttachments],
      responsiblePeople: data.responsiblePeople,
      attendeeIds: data.attendees
        .filter((attendee) =>
          ["accepted", "attended"].includes(attendee.attendance_status),
        )
        .map((attendee) => attendee.user_id),
      externalAttendees: data.externalAttendees,
      branding: pdfBranding,
      attachmentsForPdf,
    });
    const pdfFileName = `referat-${formatDanishDateKey(
      data.meeting.starts_at,
    )}.pdf`;
    const unassignedTasks = data.tasks
      .filter((task) => !task.responsible_user_id)
      .map((task) =>
        this.toApprovalEmailTask(task, organizationId, meetingUrl),
      );

    const emailService = new EmailService(this.db);
    const deliveries = await Promise.allSettled(
      data.approvals
        .filter((approval) => approval.memberEmail)
        .map((approval) =>
          emailService.sendMeetingMinutesApprovalEmail({
            to: approval.memberEmail,
            recipientName: approval.memberName,
            organizationName: data.organization.name,
            committeeName: data.committee.name,
            meetingTitle: data.meeting.title,
            meetingDate: formatDanishDateTime(data.meeting.starts_at, "full"),
            approvalUrl: meetingUrl,
            personalTasks: data.tasks
              .filter((task) => task.responsible_user_id === approval.user_id)
              .map((task) =>
                this.toApprovalEmailTask(task, organizationId, meetingUrl),
              ),
            unassignedTasks,
            pdf,
            pdfFileName,
            branding: emailBranding,
          }),
        ),
    );
    const failedDeliveries = deliveries.filter(
      (delivery) => delivery.status === "rejected",
    );
    for (const delivery of deliveries) {
      if (delivery.status === "rejected") {
        console.error("[meeting-minutes] Referatmail fejlede for modtager.", {
          organizationId,
          committeeId,
          meetingId,
          error:
            delivery.reason instanceof Error
              ? delivery.reason.message
              : String(delivery.reason),
        });
      }
    }
    const fulfilled = deliveries.flatMap((delivery) =>
      delivery.status === "fulfilled" ? [delivery.value] : [],
    );
    const errors = [
      ...fulfilled.flatMap((delivery) =>
        delivery.error ? [delivery.error] : [],
      ),
      ...failedDeliveries.map((delivery) =>
        delivery.reason instanceof Error
          ? delivery.reason.message
          : String(delivery.reason),
      ),
    ];
    const recipientCount =
      fulfilled.reduce((sum, delivery) => sum + delivery.recipientCount, 0) +
      failedDeliveries.length;
    const successfulCount = fulfilled.reduce(
      (sum, delivery) => sum + delivery.successfulCount,
      0,
    );
    const failedCount =
      failedDeliveries.length +
      fulfilled.reduce((sum, delivery) => sum + delivery.failedCount, 0);
    const stubbed = fulfilled
      .filter((delivery) => delivery.status === "stubbed")
      .reduce((sum, delivery) => sum + delivery.recipientCount, 0);
    const skippedMissingConfig = fulfilled
      .filter((delivery) => delivery.status === "skipped_missing_config")
      .reduce((sum, delivery) => sum + delivery.recipientCount, 0);
    const status: ApprovalEmailResult["status"] =
      failedCount > 0
        ? "failed"
        : successfulCount > 0
          ? "sent"
          : skippedMissingConfig > 0
            ? "skipped_missing_config"
            : "stubbed";
    const mode =
      fulfilled.find((delivery) => delivery.mode === "resend")?.mode ?? "stub";
    const warning =
      status === "sent"
        ? null
        : status === "stubbed"
          ? "Referatet blev sendt til godkendelse. Email er kun forberedt i testtilstand og er ikke sendt rigtigt."
          : status === "skipped_missing_config"
            ? "Referatet blev sendt til godkendelse, men email blev ikke sendt, fordi Resend-konfiguration mangler."
            : "Referatet blev sendt til godkendelse, men emailen kunne ikke sendes.";

    if (status === "skipped_missing_config") {
      console.warn(
        "[meeting-minutes] Referatmail blev ikke sendt: manglende email-konfiguration.",
        {
          organizationId,
          committeeId,
          meetingId,
          recipientCount,
          errors,
        },
      );
    }

    return {
      status,
      mode,
      recipientCount,
      sent: successfulCount,
      successfulCount,
      failed: failedCount,
      failedCount,
      stubbed,
      skippedMissingConfig,
      warning,
      errors,
    } satisfies ApprovalEmailResult;
  }

  async getApprovedPdfData(
    organizationId: string,
    committeeId: string,
    meetingId: string,
    options: { allowReadyForApproval?: boolean } = {},
  ) {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const organizationContext =
      await this.authorization.requireOrganizationMember(
        organizationId,
        user.id,
      );
    const meeting = await this.requireMeeting(
      organizationId,
      committeeId,
      meetingId,
    );
    const bundle = await this.get(organizationId, committeeId, meetingId);
    const allowedStatuses = options.allowReadyForApproval
      ? ["approved", "ready_for_approval"]
      : ["approved"];
    if (
      !bundle.meetingMinutes ||
      !allowedStatuses.includes(bundle.meetingMinutes.status)
    ) {
      throw new AppError(
        options.allowReadyForApproval
          ? "Referatet skal være sendt til godkendelse, før det kan downloades som PDF."
          : "Kun godkendte referater kan downloades som PDF.",
        422,
        options.allowReadyForApproval
          ? "MINUTES_NOT_READY_FOR_PDF"
          : "MINUTES_NOT_APPROVED",
      );
    }
    const [attendees, externalAttendees, decisions, tasks] = await Promise.all([
      this.meetings.listAttendees(meetingId),
      this.meetings.listExternalAttendees(meetingId),
      this.decisions.listByMeeting(meetingId),
      this.tasks.listByMeeting(meetingId),
    ]);
    return {
      organization: organizationContext.organization,
      committee: context.committee,
      meeting,
      attendees,
      externalAttendees,
      decisions,
      tasks,
      ...bundle,
    };
  }
}
