import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { createBearerClient } from "@/lib/supabase/bearer";
import { TaskRepository } from "@/repositories/task-repository";
import { TaskService } from "@/services/task-service";

const statusSchema = z.object({
  organizationId: z.string().uuid(),
  status: z.enum([
    "not_started",
    "in_progress",
    "waiting",
    "completed",
    "cancelled",
  ]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const parsed = statusSchema.parse(await request.json());
    const db = createBearerClient(request);
    const existing = await new TaskRepository(db).findById(taskId);
    if (!existing || existing.organization_id !== parsed.organizationId) {
      throw new NotFoundError("Opgaven");
    }
    const task = await new TaskService(db).update({
      organizationId: existing.organization_id,
      committeeId: existing.committee_id,
      taskId,
      meetingId: existing.meeting_id,
      agendaItemId: existing.agenda_item_id,
      decisionId: existing.decision_id,
      title: existing.title,
      description: existing.description,
      status: parsed.status,
      responsibleUserId: existing.responsible_user_id,
      deadline: existing.deadline,
      reminderAt: existing.reminder_at,
      category: existing.category,
      internalNote: existing.internal_note,
    });
    return NextResponse.json(task);
  } catch (error) {
    return apiError(error);
  }
}
