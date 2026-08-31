import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { ActionService } from "@/services/action-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const center = await new ActionService(await createClient()).getCenter(
      organizationId,
    );
    return NextResponse.json(center);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const result = await new ActionService(
      await createClient(),
    ).updatePersonalState({ ...body, organizationId });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
