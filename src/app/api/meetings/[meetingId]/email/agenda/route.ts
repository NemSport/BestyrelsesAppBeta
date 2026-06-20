import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { EmailService } from "@/services/email-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const url = new URL(request.url);
    const result = await new EmailService(await createClient()).sendMeetingAgenda(
      {
        ...(await request.json()),
        meetingId: (await params).meetingId,
      },
      url.origin,
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
