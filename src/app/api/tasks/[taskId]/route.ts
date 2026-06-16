import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { TaskService } from "@/services/task-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const service = new TaskService(await createClient());
    const task = body.action
      ? await service.performAction({
          ...body,
          taskId: (await params).taskId,
        })
      : await service.update({
          ...body,
          taskId: (await params).taskId,
        });
    return NextResponse.json(task);
  } catch (error) {
    return apiError(error);
  }
}
