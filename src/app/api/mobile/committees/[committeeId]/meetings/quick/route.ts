import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { MeetingService } from "@/services/meeting-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const meeting = await new MeetingService(
      createBearerClient(request),
    ).createQuick({
      ...(await request.json()),
      committeeId: (await params).committeeId,
    });
    return NextResponse.json(meeting, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
