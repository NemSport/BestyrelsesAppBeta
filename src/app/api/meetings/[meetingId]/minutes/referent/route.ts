import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { meetingId } = await params;
    const result = await new MeetingMinutesService(
      await createClient(),
    ).updateReferentLock({
      ...(await request.json()),
      meetingId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
