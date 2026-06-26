import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { generateMeetingAgendaPdf } from "@/lib/agenda-pdf";
import { formatDanishDateKey } from "@/lib/date-format";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { MeetingService } from "@/services/meeting-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") ?? "";
    const committeeId = searchParams.get("committeeId") ?? "";
    const meetingId = (await params).meetingId;
    const db = await createClient();
    const user = await new AuthService(db).requireUser();
    const authorization = new AuthorizationService(db);
    const [committeeContext, organizationContext] = await Promise.all([
      authorization.requireCommitteeMember(organizationId, committeeId, user.id),
      authorization.requireOrganizationMember(organizationId, user.id),
    ]);
    const meeting = await new MeetingService(db).get(
      organizationId,
      committeeId,
      meetingId,
    );
    const branding = await new OrganizationBrandingService(db).getPdfBranding(
      organizationContext.organization.id,
      organizationContext.organization.name,
    );
    const attachments = await new MeetingMinutesService(db).getPdfAttachments(
      organizationId,
      committeeId,
      meetingId,
      { includeMeetingAttachments: false },
    );
    const pdf = await generateMeetingAgendaPdf({
      meeting,
      committeeName: committeeContext.committee.name,
      organizationName: organizationContext.organization.name,
      branding,
      attachments,
    });
    const fileName = `dagsorden-${formatDanishDateKey(meeting.starts_at)}.pdf`;

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
