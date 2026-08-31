import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { StakeholderService } from "@/services/stakeholder-service";

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ stakeholderId: string; pipelineEntryId: string }> },
) {
  try {
    const ids = await params;
    return NextResponse.json(
      await new StakeholderService(await createClient()).updatePipeline({
        ...(await request.json()),
        ...ids,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
