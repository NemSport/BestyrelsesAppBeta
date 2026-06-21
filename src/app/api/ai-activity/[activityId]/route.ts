import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AiActivityLogService } from "@/services/ai-activity-log-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const { activityId } = await params;
  try {
    await new AiActivityLogService(await createClient()).updateClientStatus(
      activityId,
      await request.json(),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
