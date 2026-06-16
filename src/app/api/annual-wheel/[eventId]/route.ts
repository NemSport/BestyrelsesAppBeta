import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelService } from "@/services/annual-wheel-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  try {
    return NextResponse.json(
      await new AnnualWheelService(await createClient()).update({
        ...(await request.json()),
        eventId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  try {
    return NextResponse.json(
      await new AnnualWheelService(await createClient()).remove({
        ...(await request.json()),
        eventId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
