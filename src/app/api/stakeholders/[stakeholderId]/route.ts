import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { StakeholderService } from "@/services/stakeholder-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ stakeholderId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const service = new StakeholderService(await createClient());
    const result =
      body.action === "archive"
        ? await service.archive({
            ...body,
            stakeholderId: (await params).stakeholderId,
          })
        : await service.update({
            ...body,
            stakeholderId: (await params).stakeholderId,
          });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
