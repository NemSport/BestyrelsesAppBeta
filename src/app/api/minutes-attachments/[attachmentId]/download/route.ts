import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const result = await new MeetingMinutesService(
      await createClient(),
    ).getAttachmentDownload(
      (await params).attachmentId,
      new URL(request.url).searchParams.get("download") === "1",
    );
    return NextResponse.redirect(result.url);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const result = await new MeetingMinutesService(
      await createClient(),
    ).removeAttachment((await params).attachmentId);
    return NextResponse.json({
      attachment: result,
      message: "Bilaget er fjernet.",
    });
  } catch (error) {
    return apiError(error);
  }
}
