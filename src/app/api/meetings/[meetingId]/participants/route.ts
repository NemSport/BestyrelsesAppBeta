import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingService } from "@/services/meeting-service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const meetingId = (await params).meetingId;
    const body = await request.json();
    const result = await new MeetingService(await createClient()).saveParticipants({
      ...body,
      meetingId,
    });
    return NextResponse.json({
      ...result,
      message: "Deltagere er gemt.",
    });
  } catch (error) {
    return apiError(error);
  }
}
