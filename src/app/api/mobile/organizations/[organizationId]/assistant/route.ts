import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { MobileAiAssistantService } from "@/services/mobile-ai-assistant-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const answer = await new MobileAiAssistantService(
      createBearerClient(request),
    ).ask({
      ...(await request.json()),
      organizationId: (await params).organizationId,
    });
    return NextResponse.json(answer);
  } catch (error) {
    return apiError(error);
  }
}
