import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const body = (await request.json()) as {
      action?: string;
      status?: string;
      [key: string]: unknown;
    };
    const service = new MeetingMinutesService(await createClient());
    const meetingId = (await params).meetingId;

    if (body.action === "send") {
      const minutes = await service.sendForApproval({ ...body, meetingId });
      return NextResponse.json({
        minutes,
        message: "Referatet er sendt til godkendelse.",
      });
    }
    if (body.action === "respond") {
      const approval = await service.respondToApproval({ ...body, meetingId });
      return NextResponse.json({
        approval,
        message:
          body.status === "approved"
            ? "Du har godkendt referatet."
            : "Dit ændringsønske er gemt.",
      });
    }
    if (body.action === "mark_no_response") {
      const approvals = await service.markNoResponse({ ...body, meetingId });
      return NextResponse.json({
        approvals,
        message: "Manglende svar er markeret som ingen respons.",
      });
    }

    return NextResponse.json(
      { error: "Godkendelseshandlingen er ugyldig." },
      { status: 422 },
    );
  } catch (error) {
    return apiError(error);
  }
}
