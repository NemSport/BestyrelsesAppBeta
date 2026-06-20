import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { TaskService } from "@/services/task-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const tasks = await new TaskService(createBearerClient(request)).getMyTasks(
      organizationId,
    );
    return NextResponse.json(tasks);
  } catch (error) {
    return apiError(error);
  }
}
