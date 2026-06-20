import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AiMeetingOverviewService } from "@/services/ai-meeting-overview-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;
  try {
    const result = await new AiMeetingOverviewService(
      await createClient(),
    ).generate({
      ...(await request.json()),
      meetingId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
