import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelService } from "@/services/annual-wheel-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  try {
    return NextResponse.json(
      await new AnnualWheelService(await createClient()).activateTasks({
        ...(await request.json()),
        eventId,
      }),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
