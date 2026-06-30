import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { DecisionService } from "@/services/decision-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const data = await new DecisionService(
      createBearerClient(request),
    ).getRegister(organizationId);
    return NextResponse.json({ decisions: data.decisions });
  } catch (error) {
    return apiError(error);
  }
}
