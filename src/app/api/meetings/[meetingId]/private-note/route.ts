import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { meetingId } = await params;
    const note = await new MeetingMinutesService(
      await createClient(),
    ).savePrivateMeetingNote({
      ...(await request.json()),
      meetingId,
    });
    return NextResponse.json({
      note,
      message: "Dine interne mødenoter er gemt.",
    });
  } catch (error) {
    return apiError(error);
  }
}
