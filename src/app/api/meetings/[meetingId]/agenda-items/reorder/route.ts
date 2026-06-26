import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const result = await new AgendaItemService(
      await createClient(),
    ).reorderMeetingOccurrences({
      ...(await request.json()),
      organizationId: searchParams.get("organizationId") ?? "",
      committeeId: searchParams.get("committeeId") ?? "",
      meetingId: (await params).meetingId,
    });
    return NextResponse.json({
      occurrences: result,
      message: "Rækkefølgen er gemt.",
    });
  } catch (error) {
    return apiError(error);
  }
}
