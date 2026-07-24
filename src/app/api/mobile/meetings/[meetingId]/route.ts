import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { getMeetingCapabilities } from "@/lib/permissions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { meetingId } = await params;
    const db = createBearerClient(request);
    const user = await new AuthService(db).requireUser();
    const meeting = await new MeetingRepository(db).findWithAgenda(meetingId);
    if (!meeting) {
      return NextResponse.json(
        { error: "Mødet blev ikke fundet." },
        { status: 404 },
      );
    }
    const minutes = await new MeetingMinutesService(db).get(
      meeting.organization_id,
      meeting.committee_id,
      meeting.id,
    );
    const context = await new AuthorizationService(db).requireCommitteeMember(
      meeting.organization_id,
      meeting.committee_id,
      user.id,
    );
    const capabilities = getMeetingCapabilities(
      context.organizationMembership.role,
      context.membership?.role ?? null,
    );
    return NextResponse.json({ meeting, minutes, capabilities } satisfies {
      meeting: NonNullable<typeof meeting>;
      minutes: Awaited<ReturnType<MeetingMinutesService["get"]>>;
      capabilities: ReturnType<typeof getMeetingCapabilities>;
    });
  } catch (error) {
    return apiError(error);
  }
}
