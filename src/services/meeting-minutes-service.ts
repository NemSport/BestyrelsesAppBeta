import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError, AuthorizationError, NotFoundError } from "@/lib/errors";
import { getAgendaItemTransferRule } from "@/lib/agenda-item-minutes";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  agendaItemMinutesInputSchema,
  markNoResponseSchema,
  meetingMinutesInputSchema,
  minutesApprovalResponseSchema,
  sendMinutesForApprovalSchema,
} from "@/lib/validation";
import { MeetingMinutesGovernanceRepository } from "@/repositories/meeting-minutes-governance-repository";
import { MeetingMinutesRepository } from "@/repositories/meeting-minutes-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { OrganizationRepository } from "@/repositories/organization-repository";
import { TransferredAgendaItemRepository } from "@/repositories/transferred-agenda-item-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";
import type { MeetingWithAgenda } from "@/types/domain";

export class MeetingMinutesService {
  private readonly minutes: MeetingMinutesRepository;
  private readonly governance: MeetingMinutesGovernanceRepository;
  private readonly meetings: MeetingRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly organizations: OrganizationRepository;
  private readonly transfers: TransferredAgendaItemRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.minutes = new MeetingMinutesRepository(db);
    this.governance = new MeetingMinutesGovernanceRepository(db);
    this.meetings = new MeetingRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.organizations = new OrganizationRepository(db);
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

  async get(organizationId: string, committeeId: string, meetingId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    await this.requireMeeting(organizationId, committeeId, meetingId);

    const [meetingMinutes, agendaItemMinutes, members] = await Promise.all([
      this.minutes.findMeetingMinutes(meetingId),
      this.minutes.listAgendaItemMinutes(meetingId),
      this.members.listMembers(organizationId),
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
      agendaItemMinutes,
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
      return this.minutes.updateMeetingMinutes(existing.id, values);
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
      ? await this.minutes.updateAgendaItemMinutes(existing.id, values)
      : await this.minutes.createAgendaItemMinutes({
          organization_id: parsed.organizationId,
          committee_id: parsed.committeeId,
          meeting_id: parsed.meetingId,
          agenda_item_id: parsed.agendaItemId,
          ...values,
          created_by: user.id,
        });

    const transferRule = getAgendaItemTransferRule(
      parsed.itemType,
      parsed.status,
    );
    const pendingTransfers =
      await this.transfers.listPendingBySourceMinutes(savedMinutes.id);
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

  async sendForApproval(input: unknown) {
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
    const minutes = await this.minutes.findMeetingMinutes(parsed.meetingId);
    if (!minutes) throw new NotFoundError("Referatet");
    if (parsed.deadline < new Date().toISOString().slice(0, 10)) {
      throw new AppError(
        "Godkendelsesfristen kan ikke ligge i fortiden.",
        422,
        "INVALID_APPROVAL_DEADLINE",
      );
    }
    return this.governance.sendForApproval(minutes.id, parsed.deadline);
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
      throw new AppError(
        "Filen må højst fylde 25 MB.",
        422,
        "FILE_TOO_LARGE",
      );
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

  async getApprovedPdfData(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ) {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const organizationContext =
      await this.authorization.requireOrganizationMember(organizationId, user.id);
    const meeting = await this.requireMeeting(
      organizationId,
      committeeId,
      meetingId,
    );
    const bundle = await this.get(organizationId, committeeId, meetingId);
    if (!bundle.meetingMinutes || bundle.meetingMinutes.status !== "approved") {
      throw new AppError(
        "Kun godkendte referater kan downloades som PDF.",
        422,
        "MINUTES_NOT_APPROVED",
      );
    }
    const attendees = await this.meetings.listAttendees(meetingId);
    return {
      organization: organizationContext.organization,
      committee: context.committee,
      meeting,
      attendees,
      ...bundle,
    };
  }
}
