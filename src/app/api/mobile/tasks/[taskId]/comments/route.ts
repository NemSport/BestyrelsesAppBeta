import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { TaskCommentService } from "@/services/task-comment-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    const comments = await new TaskCommentService(
      createBearerClient(request),
    ).list(organizationId ?? "", (await params).taskId);
    return NextResponse.json({ comments });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const comment = await new TaskCommentService(
      createBearerClient(request),
    ).create({
      ...(await request.json()),
      taskId: (await params).taskId,
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
