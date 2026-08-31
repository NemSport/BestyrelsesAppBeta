import type { SupabaseClient } from "@supabase/supabase-js";

import { generateMeetingAgendaPdf } from "@/lib/agenda-pdf";
import { formatDanishDateKey } from "@/lib/date-format";
import { getEmailEnv } from "@/lib/email-env";
import { meetingMaterialsEmailTemplate } from "@/lib/email-templates";
import { AppError, NotFoundError } from "@/lib/errors";
import {
  meetingMaterialContentLabels,
  meetingMaterialDispatchSchema,
  resolveMeetingParticipantRecipients,
  resolveSelectedMeetingMaterialRecipients,
  tasksForRecipient,
} from "@/lib/meeting-material-dispatch";
import { generateMeetingTasklistPdf } from "@/lib/meeting-tasklist-pdf";
import { generateMeetingMinutesPdf } from "@/lib/minutes-pdf";
import { formatDateTime } from "@/lib/localization";
import { MeetingMaterialDispatchRepository } from "@/repositories/meeting-material-dispatch-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { DocumentService } from "@/services/document-service";
import { EmailService, type EmailDeliveryResult } from "@/services/email-service";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { MeetingService } from "@/services/meeting-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";
import { TaskService } from "@/services/task-service";
import { TransferredAgendaItemService } from "@/services/transferred-agenda-item-service";
import type { Database, Json } from "@/types/database";
import type {
  MeetingMaterialDispatchHistory,
} from "@/types/meeting-materials";

type PreparedAttachment = { filename: string; content: string };

function asBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function deliverySummary(
  deliveries: Array<PromiseSettledResult<EmailDeliveryResult>>,
) {
  const fulfilled = deliveries.flatMap((delivery) =>
    delivery.status === "fulfilled" ? [delivery.value] : [],
  );
  const failedCount = deliveries.length - fulfilled.length;
  const statuses = new Set(fulfilled.map((delivery) => delivery.status));
  const deliveryMode = fulfilled.some((delivery) => delivery.mode === "resend")
    ? ("resend" as const)
    : ("stub" as const);
  if (!fulfilled.length) {
    return { deliveryStatus: "failed" as const, deliveryMode, failedCount };
  }
  if (failedCount || statuses.size > 1) {
    return { deliveryStatus: "partial" as const, deliveryMode, failedCount };
  }
  const [status] = statuses;
  return {
    deliveryStatus:
      status === "sent"
        ? ("sent" as const)
        : status === "skipped_missing_config"
          ? ("skipped_missing_config" as const)
          : ("stubbed" as const),
    deliveryMode,
    failedCount,
  };
}

function parseHistory(
  row: Database["public"]["Tables"]["meeting_material_dispatches"]["Row"],
  senderName: string,
): MeetingMaterialDispatchHistory {
  return {
    ...row,
    content_types: row.content_types as MeetingMaterialDispatchHistory["content_types"],
    task_list_mode: row.task_list_mode as MeetingMaterialDispatchHistory["task_list_mode"],
    recipient_snapshot:
      row.recipient_snapshot as MeetingMaterialDispatchHistory["recipient_snapshot"],
    document_snapshot:
      row.document_snapshot as MeetingMaterialDispatchHistory["document_snapshot"],
    senderName,
  };
}

export class MeetingMaterialDispatchService {
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;
  private readonly history: MeetingMaterialDispatchRepository;
  private readonly members: OrganizationMemberRepository;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
    this.history = new MeetingMaterialDispatchRepository(db);
    this.members = new OrganizationMemberRepository(db);
  }

  async listHistory(
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
    const meeting = await new MeetingService(this.db).get(
      organizationId,
      committeeId,
      meetingId,
    );
    if (!meeting) throw new NotFoundError("Mødet");
    const rows = await this.history.listByMeeting(meetingId);
    const profiles = await this.history.listProfiles(
      rows.map((row) => row.sender_id),
    );
    const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
    return rows.map((row) =>
      parseHistory(row, names.get(row.sender_id) || "Ukendt bruger"),
    );
  }

  async send(input: unknown, appUrl: string) {
    const parsed = meetingMaterialDispatchSchema.parse(input);
    const user = await this.auth.requireUser();
    const [committeeContext, organizationContext] = await Promise.all([
      this.authorization.requireMeetingCapability(
        parsed.organizationId,
        parsed.committeeId,
        user.id,
        "sendAgendaEmail",
      ),
      this.authorization.requireOrganizationMember(parsed.organizationId, user.id),
    ]);
    const meetingService = new MeetingService(this.db);
    const meeting = await meetingService.get(
      parsed.organizationId,
      parsed.committeeId,
      parsed.meetingId,
    );
    const [participants, memberDirectory] = await Promise.all([
      meetingService.getParticipants(
        parsed.organizationId,
        parsed.committeeId,
        parsed.meetingId,
      ),
      this.members.listMembers(parsed.organizationId),
    ]);
    const activeMembers = memberDirectory.filter((member) => member.status === "active");
    const membersById = new Map(activeMembers.map((member) => [member.user_id, member]));
    const participantResolution = resolveMeetingParticipantRecipients({
      committeeId: parsed.committeeId,
      members: memberDirectory,
      internalParticipants: participants.internalParticipants,
      externalParticipants: participants.externalAttendees,
    });
    const selectedResolution = resolveSelectedMeetingMaterialRecipients({
      members: memberDirectory,
      selectedUserIds: parsed.recipientUserIds,
    });
    if (
      parsed.recipientMode === "selected" &&
      selectedResolution.invalidUserIds.length > 0
    ) {
      throw new AppError(
        "En eller flere valgte modtagere er ikke aktive medlemmer med en emailadresse.",
        422,
        "DISPATCH_INVALID_RECIPIENT",
      );
    }
    const recipients =
      parsed.recipientMode === "participants"
        ? participantResolution.recipients
        : selectedResolution.recipients;
    if (!recipients.length) {
      throw new AppError(
        "Der blev ikke fundet nogen deltagere med en gyldig emailadresse.",
        422,
        "DISPATCH_NO_RECIPIENTS",
      );
    }

    const brandingService = new OrganizationBrandingService(this.db);
    const minutesService = new MeetingMinutesService(this.db);
    const taskService = new TaskService(this.db);
    const transferService = new TransferredAgendaItemService(this.db);
    const agendaItemIds = meeting.agenda_item_occurrences.map(
      (occurrence) => occurrence.agenda_item_id,
    );
    const needsTasks = parsed.contentTypes.includes("tasks");
    const needsMinutes = parsed.contentTypes.includes("minutes");
    const needsAgenda = parsed.contentTypes.includes("agenda");
    const [pdfBranding, emailBranding, tasklist, transferredHistories, documents] =
      await Promise.all([
        brandingService.getPdfBranding(
          parsed.organizationId,
          organizationContext.organization.name,
        ),
        brandingService.getEmailBranding(
          parsed.organizationId,
          organizationContext.organization.name,
        ),
        needsTasks
          ? taskService.getMeetingReviewTasks(
              parsed.organizationId,
              parsed.committeeId,
              parsed.meetingId,
            )
          : Promise.resolve(null),
        needsAgenda || needsMinutes
          ? transferService.listPdfHistoryForMeeting(
              parsed.organizationId,
              parsed.committeeId,
              parsed.meetingId,
            )
          : Promise.resolve([]),
        parsed.includeAttachments
          ? new DocumentService(this.db).getDispatchDocuments({
              organizationId: parsed.organizationId,
              committeeId: parsed.committeeId,
              meetingId: parsed.meetingId,
              agendaItemIds,
              documentIds: parsed.documentIds,
            })
          : Promise.resolve([]),
      ]);

    const commonAttachments: PreparedAttachment[] = documents.map((document) => ({
      filename: document.snapshot.fileName,
      content: asBase64(document.bytes),
    }));
    const dateKey = formatDanishDateKey(meeting.starts_at);

    if (needsAgenda) {
      const pdf = await generateMeetingAgendaPdf({
        meeting,
        committeeName: committeeContext.committee.name,
        organizationName: organizationContext.organization.name,
        branding: pdfBranding,
        attachments: [],
        transferredHistories,
      });
      commonAttachments.unshift({
        filename: `dagsorden-${dateKey}.pdf`,
        content: asBase64(pdf),
      });
    }

    if (needsMinutes) {
      const data = await minutesService.getApprovedPdfData(
        parsed.organizationId,
        parsed.committeeId,
        parsed.meetingId,
        { allowReadyForApproval: true },
      );
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
        attachmentsForPdf: [],
        transferredHistories,
      });
      commonAttachments.push({
        filename: `referat-${dateKey}.pdf`,
        content: asBase64(pdf),
      });
    }

    if (needsTasks && parsed.taskListMode === "general" && tasklist) {
      const pdf = await generateMeetingTasklistPdf({
        meeting: tasklist.meeting,
        committeeName: committeeContext.committee.name,
        organizationName: organizationContext.organization.name,
        tasks: tasklist.tasks,
        branding: pdfBranding,
      });
      commonAttachments.push({
        filename: `opgaveliste-${dateKey}.pdf`,
        content: asBase64(pdf),
      });
    }

    const root = appUrl.replace(/\/$/, "");
    const meetingUrl = `${root}/organizations/${parsed.organizationId}/committees/${parsed.committeeId}/meetings/${parsed.meetingId}`;
    const emailService = new EmailService(this.db);
    const deliveries = await Promise.allSettled(
      recipients.map(async (recipient) => {
        const attachments = [...commonAttachments];
        if (needsTasks && parsed.taskListMode === "personal" && tasklist) {
          const pdf = await generateMeetingTasklistPdf({
            meeting: tasklist.meeting,
            committeeName: committeeContext.committee.name,
            organizationName: organizationContext.organization.name,
            tasks: tasksForRecipient(tasklist.tasks, recipient.userId),
            branding: pdfBranding,
          });
          attachments.push({
            filename: `opgaveliste-${dateKey}-${recipient.userId ?? "ekstern"}.pdf`,
            content: asBase64(pdf),
          });
        }
        const template = meetingMaterialsEmailTemplate({
          organizationName: organizationContext.organization.name,
          committeeName: committeeContext.committee.name,
          meetingTitle: meeting.title,
          meetingDate: formatDateTime(meeting.starts_at, "full"),
          recipientName: recipient.name,
          subject: parsed.subject,
          message: parsed.message,
          contentLabels: parsed.contentTypes.map((type) =>
            type === "tasks" && parsed.taskListMode === "personal"
              ? "Personlig opgaveliste"
              : meetingMaterialContentLabels[type],
          ),
          documentNames: documents.map((document) => document.snapshot.name),
          personalTaskList: parsed.taskListMode === "personal",
          meetingUrl,
          branding: emailBranding,
        });
        return emailService.sendPrepared({
          from: getEmailEnv().EMAIL_FROM,
          to: [recipient.email],
          ...template,
          attachments,
        });
      }),
    );

    const summary = deliverySummary(deliveries);
    const sender = membersById.get(user.id);
    const historyRow = await this.history.create({
      organization_id: parsed.organizationId,
      committee_id: parsed.committeeId,
      meeting_id: parsed.meetingId,
      sender_id: user.id,
      subject: parsed.subject,
      message: parsed.message,
      content_types: parsed.contentTypes,
      task_list_mode: needsTasks ? parsed.taskListMode ?? null : null,
      recipient_count: recipients.length,
      recipient_snapshot: recipients as unknown as Json,
      document_snapshot: documents.map((document) => document.snapshot) as unknown as Json,
      delivery_status: summary.deliveryStatus,
      delivery_mode: summary.deliveryMode,
    });

    return {
      history: parseHistory(
        historyRow,
        sender?.full_name || sender?.email || "Ukendt bruger",
      ),
      recipientCount: recipients.length,
      failedCount: summary.failedCount,
      status: summary.deliveryStatus,
      mode: summary.deliveryMode,
    };
  }
}
