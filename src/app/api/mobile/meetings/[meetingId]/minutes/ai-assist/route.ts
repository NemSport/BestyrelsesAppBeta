import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { AiMinutesAssistantService } from "@/services/ai-minutes-assistant-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;
  try {
    const result = await new AiMinutesAssistantService(
      createBearerClient(request),
    ).rewrite({
      ...(await request.json()),
      meetingId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
