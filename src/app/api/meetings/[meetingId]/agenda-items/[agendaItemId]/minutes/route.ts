import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";

export async function PUT(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ meetingId: string; agendaItemId: string }>;
  },
) {
  try {
    const { meetingId, agendaItemId } = await params;
    const minutes = await new MeetingMinutesService(
      await createClient(),
    ).saveAgendaItemMinutes({
      ...(await request.json()),
      meetingId,
      agendaItemId,
    });
    return NextResponse.json({
      minutes,
      message: "Referatet for dagsordenspunktet er gemt.",
    });
  } catch (error) {
    return apiError(error);
  }
}
