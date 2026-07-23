import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { formatDanishDateKey } from "@/lib/date-format";
import { generateMeetingTasklistPdf } from "@/lib/meeting-tasklist-pdf";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";
import { TaskService } from "@/services/task-service";

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
    const [committeeContext, organizationContext, tasklist] =
      await Promise.all([
        authorization.requireCommitteeMember(
          organizationId,
          committeeId,
          user.id,
        ),
        authorization.requireOrganizationMember(organizationId, user.id),
        new TaskService(db).getMeetingReviewTasks(
          organizationId,
          committeeId,
          meetingId,
        ),
      ]);
    const branding = await new OrganizationBrandingService(db).getPdfBranding(
      organizationContext.organization.id,
      organizationContext.organization.name,
    );
    const pdf = await generateMeetingTasklistPdf({
      meeting: tasklist.meeting,
      committeeName: committeeContext.committee.name,
      organizationName: organizationContext.organization.name,
      tasks: tasklist.tasks,
      branding,
    });
    const fileName = `opgaveliste-${formatDanishDateKey(tasklist.meeting.starts_at)}.pdf`;

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
