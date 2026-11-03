import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { TransferredAgendaItemService } from "@/services/transferred-agenda-item-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { meetingId } = await params;
    const count = await new TransferredAgendaItemService(
      await createClient(),
    ).continueOnMeeting(meetingId);
    return NextResponse.json({ count });
  } catch (error) {
    return apiError(error);
  }
}
