import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingService } from "@/services/meeting-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const meeting = await new MeetingService(await createClient()).update({
      ...(await request.json()),
      meetingId: (await params).meetingId,
    });
    return NextResponse.json(meeting);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const result = await new MeetingService(await createClient()).moveToTrash({
      organizationId: searchParams.get("organizationId") ?? "",
      committeeId: searchParams.get("committeeId") ?? "",
      meetingId: (await params).meetingId,
    });
    return NextResponse.json({
      ...result,
      message: "Mødet er flyttet til papirkurven.",
    });
  } catch (error) {
    return apiError(error);
  }
}
