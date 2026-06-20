import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { AiMeetingOverviewService } from "@/services/ai-meeting-overview-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const overview = await new AiMeetingOverviewService(
      createBearerClient(request),
    ).generate({
      ...(await request.json()),
      meetingId: (await params).meetingId,
    });
    return NextResponse.json(overview);
  } catch (error) {
    return apiError(error);
  }
}
