import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import type { Database } from "@/types/database";
import { pdfTemplateConfigSchema } from "@/lib/pdf-template-config";
import { createPdfReport } from "@/lib/pdf-report";
import { generateMeetingMinutesPdf } from "@/lib/minutes-pdf";
import { generateMeetingTasklistPdf } from "@/lib/meeting-tasklist-pdf";
import { generateMeetingAgendaPdf } from "@/lib/agenda-pdf";
import { OrganizationBrandingService } from "@/services/organization-branding-service";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { MeetingService } from "@/services/meeting-service";
import { TaskService } from "@/services/task-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { TransferredAgendaItemService } from "@/services/transferred-agenda-item-service";

const inputSchema = z
  .object({
    config: pdfTemplateConfigSchema,
    kind: z.enum(["sample", "minutes", "agenda", "tasks"]),
    orientation: z.enum(["portrait", "landscape"]),
    meetingId: z.string().uuid().optional(),
    committeeId: z.string().uuid().optional(),
  })
  .refine(
    (input) =>
      input.kind === "sample" || Boolean(input.meetingId && input.committeeId),
    "Vælg et møde.",
  );

export class OrganizationPdfPreviewService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listMeetings(organizationId: string) {
    const user = await new AuthService(this.db).requireUser();
    await new AuthorizationService(this.db).requireOrganizationAdmin(
      organizationId,
      user.id,
    );
    return new MeetingRepository(this.db).listForPdfPreview(organizationId);
  }

  async generate(organizationId: string, input: unknown) {
    const user = await new AuthService(this.db).requireUser();
    const authorization = new AuthorizationService(this.db);
    const context = await authorization.requireOrganizationAdmin(
      organizationId,
      user.id,
    );
    const parsed = inputSchema.parse(input);
    const branding = await new OrganizationBrandingService(
      this.db,
    ).getPreviewBranding(
      organizationId,
      context.organization.name,
      parsed.config,
    );
    let bytes: Uint8Array;
    if (parsed.kind === "sample") {
      const report = await createPdfReport({
        documentType: "Forhåndsvisning",
        title: "Prøvedokument",
        organizationName: context.organization.name,
        orientation: parsed.orientation,
        branding,
      });
      for (let index = 1; index <= 14; index++) {
        report.addSection(`${index}. Dagsordenspunkt`);
        report.addParagraph(
          "Her vises et eksempel på dokumentets indhold. Teksten følger det markerede indholdsfelt, og fortsættelsessider bruger din valgte opsætning. Dette er et prøvedokument med fiktive oplysninger.",
        );
        report.addParagraph(
          "Beslutning og opfølgning: Den ansvarlige følger op på næste møde.",
        );
      }
      bytes = await report.save();
    } else {
      const committeeId = parsed.committeeId!;
      const meetingId = parsed.meetingId!;
      const committee = await authorization.requireCommitteeMember(
        organizationId,
        committeeId,
        user.id,
      );
      if (parsed.kind === "tasks") {
        const data = await new TaskService(this.db).getMeetingReviewTasks(
          organizationId,
          committeeId,
          meetingId,
        );
        bytes = await generateMeetingTasklistPdf({
          meeting: data.meeting,
          committeeName: committee.committee.name,
          organizationName: context.organization.name,
          tasks: data.tasks,
          branding,
        });
      } else if (parsed.kind === "agenda") {
        const meeting = await new MeetingService(this.db).get(
          organizationId,
          committeeId,
          meetingId,
        );
        const transferredHistories = await new TransferredAgendaItemService(
          this.db,
        ).listPdfHistoryForMeeting(organizationId, committeeId, meetingId);
        bytes = await generateMeetingAgendaPdf({
          meeting,
          committeeName: committee.committee.name,
          organizationName: context.organization.name,
          branding,
          transferredHistories,
        });
      } else {
        const data = await new MeetingMinutesService(
          this.db,
        ).getApprovedPdfData(organizationId, committeeId, meetingId, {
          allowReadyForApproval: true,
        });
        const transferredHistories = await new TransferredAgendaItemService(
          this.db,
        ).listPdfHistoryForMeeting(organizationId, committeeId, meetingId);
        bytes = await generateMeetingMinutesPdf({
          meeting: data.meeting,
          committeeName: data.committee.name,
          meetingMinutes: data.meetingMinutes!,
          agendaItemMinutes: data.agendaItemMinutes,
          decisions: data.decisions,
          tasks: data.tasks,
          approvals: data.approvals,
          attachments: [
            ...data.meetingAttachments,
            ...data.agendaItemAttachments,
          ],
          responsiblePeople: data.responsiblePeople,
          attendeeIds: data.attendees
            .filter((attendee) =>
              ["accepted", "attended"].includes(attendee.attendance_status),
            )
            .map((attendee) => attendee.user_id),
          externalAttendees: data.externalAttendees,
          branding,
          transferredHistories,
        });
      }
    }
    return { bytes, pages: (await PDFDocument.load(bytes)).getPageCount() };
  }
}
