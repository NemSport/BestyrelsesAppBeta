import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingService } from "@/services/meeting-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const meeting = await new MeetingService(await createClient()).createQuick({
      ...(await request.json()),
      committeeId: (await params).committeeId,
    });
    return NextResponse.json(meeting, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
