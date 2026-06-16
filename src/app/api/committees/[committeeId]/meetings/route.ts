import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { MeetingService } from "@/services/meeting-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const { committeeId } = await params;
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organisation mangler." }, { status: 422 });
    }
    return NextResponse.json(
      await new MeetingService(await createClient()).list(organizationId, committeeId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const meeting = await new MeetingService(await createClient()).create({
      ...(await request.json()),
      committeeId: (await params).committeeId,
    });
    return NextResponse.json(meeting, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
