import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { TaskService } from "@/services/task-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const data = await new TaskService(await createClient()).getRegister(
      (await params).organizationId,
    );
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const task = await new TaskService(await createClient()).create({
      ...(await request.json()),
      organizationId: (await params).organizationId,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
