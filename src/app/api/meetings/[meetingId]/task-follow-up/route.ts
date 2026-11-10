import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingTaskFollowUpService } from "@/services/meeting-task-follow-up-service";

type Context = { params: Promise<{ meetingId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const scope = Object.fromEntries(new URL(request.url).searchParams);
    return NextResponse.json(
      await new MeetingTaskFollowUpService(await createClient()).read({
        ...scope,
        meetingId: (await context.params).meetingId,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    return NextResponse.json(
      await new MeetingTaskFollowUpService(await createClient()).ensure({
        ...(await request.json()),
        meetingId: (await context.params).meetingId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    return NextResponse.json(
      await new MeetingTaskFollowUpService(await createClient()).mutate({
        ...(await request.json()),
        meetingId: (await context.params).meetingId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
