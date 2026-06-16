import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DecisionService } from "@/services/decision-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ decisionId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const service = new DecisionService(await createClient());
    const decision = body.action
      ? await service.performAction({
          ...body,
          decisionId: (await params).decisionId,
        })
      : await service.update({
          ...body,
          decisionId: (await params).decisionId,
        });
    return NextResponse.json(decision);
  } catch (error) {
    return apiError(error);
  }
}
