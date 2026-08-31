import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { StakeholderService } from "@/services/stakeholder-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    return NextResponse.json(
      await new StakeholderService(await createClient()).createDeliverable({
        ...(await request.json()),
        contractId: (await params).contractId,
      }),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
