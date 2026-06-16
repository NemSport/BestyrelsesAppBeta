import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AiTaskSuggestionService } from "@/services/ai-task-suggestion-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;
  try {
    const result = await new AiTaskSuggestionService(
      await createClient(),
    ).suggest({
      ...(await request.json()),
      meetingId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
