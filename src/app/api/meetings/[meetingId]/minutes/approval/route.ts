import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";

function minutesApprovalMessage(email: {
  status?: string;
  warning?: string | null;
  successfulCount?: number;
  recipientCount?: number;
}) {
  if (email.warning) return email.warning;
  if (email.status === "sent") {
    const count = email.successfulCount ?? email.recipientCount ?? 0;
    return count > 0
      ? `Referatet er sendt til godkendelse, og email er sendt til ${count} ${count === 1 ? "medlem" : "medlemmer"}.`
      : "Referatet er sendt til godkendelse, og email er sendt til medlemmerne.";
  }
  if (email.status === "stubbed") {
    return "Referatet er sendt til godkendelse. Email er kun forberedt i testtilstand og er ikke sendt rigtigt.";
  }
  if (email.status === "skipped_missing_config") {
    return "Referatet er sendt til godkendelse, men email blev ikke sendt, fordi Resend-konfiguration mangler.";
  }
  if (email.status === "failed") {
    return "Referatet er sendt til godkendelse, men email kunne ikke sendes.";
  }
  return "Referatet er sendt til godkendelse.";
}

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
    const url = new URL(request.url);

    if (body.action === "send") {
      const result = await service.sendForApproval(
        { ...body, meetingId },
        { appUrl: url.origin },
      );
      return NextResponse.json({
        minutes: result.minutes,
        email: result.email,
        message: minutesApprovalMessage(result.email),
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
