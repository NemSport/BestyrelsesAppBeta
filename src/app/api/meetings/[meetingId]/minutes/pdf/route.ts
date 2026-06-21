import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { generateMeetingMinutesPdf } from "@/lib/minutes-pdf";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { searchParams } = new URL(request.url);
    const db = await createClient();
    const data = await new MeetingMinutesService(db).getApprovedPdfData(
      searchParams.get("organizationId") ?? "",
      searchParams.get("committeeId") ?? "",
      (await params).meetingId,
    );
    const branding = await new OrganizationBrandingService(db).getPdfBranding(
      data.organization.id,
      data.organization.name,
    );
    const pdf = await generateMeetingMinutesPdf({
      meeting: data.meeting,
      committeeName: data.committee.name,
      meetingMinutes: data.meetingMinutes!,
      agendaItemMinutes: data.agendaItemMinutes,
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
      branding,
    });
    const fileName = `referat-${data.meeting.starts_at.slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
