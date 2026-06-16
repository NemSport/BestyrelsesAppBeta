import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelService } from "@/services/annual-wheel-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await params;
  try {
    const result = await new AnnualWheelService(await createClient()).create({
      ...(await request.json()),
      organizationId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
