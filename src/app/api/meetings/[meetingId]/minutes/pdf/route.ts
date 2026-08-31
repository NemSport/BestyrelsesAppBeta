import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { formatDanishDateKey } from "@/lib/date-format";
import { generateMeetingMinutesPdf } from "@/lib/minutes-pdf";
import { pdfContentDisposition } from "@/lib/pdf-response";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";
import { TransferredAgendaItemService } from "@/services/transferred-agenda-item-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = (await params).meetingId;
    const organizationId = searchParams.get("organizationId") ?? "";
    const committeeId = searchParams.get("committeeId") ?? "";
    const includeAttachments = searchParams.get("includeAttachments") === "1";
    const db = await createClient();
    const service = new MeetingMinutesService(db);
    const data = await service.getApprovedPdfData(
      organizationId,
      committeeId,
      meetingId,
      { allowReadyForApproval: true },
    );
    const branding = await new OrganizationBrandingService(db).getPdfBranding(
      data.organization.id,
      data.organization.name,
    );
    const [attachmentsForPdf, transferredHistories] = await Promise.all([
      includeAttachments
        ? service.getPdfAttachments(organizationId, committeeId, meetingId, {
            includeMeetingAttachments: true,
          })
        : Promise.resolve([]),
      new TransferredAgendaItemService(db).listPdfHistoryForMeeting(
        organizationId,
        committeeId,
        meetingId,
      ),
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
      branding,
      attachmentsForPdf,
      transferredHistories,
    });
    const fileName = `referat-${formatDanishDateKey(data.meeting.starts_at)}${
      includeAttachments ? "-med-bilag" : ""
    }.pdf`;

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Disposition": pdfContentDisposition(fileName),
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
