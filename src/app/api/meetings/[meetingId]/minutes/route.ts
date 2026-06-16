import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await new MeetingMinutesService(await createClient()).get(
      searchParams.get("organizationId") ?? "",
      searchParams.get("committeeId") ?? "",
      (await params).meetingId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const minutes = await new MeetingMinutesService(
      await createClient(),
    ).saveMeetingMinutes({
      ...(await request.json()),
      meetingId: (await params).meetingId,
    });
    return NextResponse.json({
      minutes,
      message: "Referatet er gemt.",
    });
  } catch (error) {
    return apiError(error);
  }
}
