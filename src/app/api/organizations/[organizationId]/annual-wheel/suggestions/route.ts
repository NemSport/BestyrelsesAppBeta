import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelAiService } from "@/services/annual-wheel-ai-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await params;
  try {
    return NextResponse.json(
      await new AnnualWheelAiService(await createClient()).suggest({
        ...(await request.json()),
        organizationId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
