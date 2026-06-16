import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Vælg en fil, der skal vedhæftes." },
        { status: 422 },
      );
    }

    const attachment = await new MeetingMinutesService(
      await createClient(),
    ).uploadAttachment({
      organizationId: String(formData.get("organizationId") ?? ""),
      committeeId: String(formData.get("committeeId") ?? ""),
      meetingId: (await params).meetingId,
      agendaItemId: String(formData.get("agendaItemId") ?? "") || null,
      file,
    });

    return NextResponse.json({
      attachment,
      message: "Filen er vedhæftet.",
    });
  } catch (error) {
    return apiError(error);
  }
}
