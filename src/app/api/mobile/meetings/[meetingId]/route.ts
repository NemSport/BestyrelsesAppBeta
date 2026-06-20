import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { MeetingRepository } from "@/repositories/meeting-repository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { meetingId } = await params;
    const db = createBearerClient(request);
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
    return NextResponse.json({ meeting, minutes } satisfies {
      meeting: NonNullable<typeof meeting>;
      minutes: Awaited<ReturnType<MeetingMinutesService["get"]>>;
    });
  } catch (error) {
    return apiError(error);
  }
}
