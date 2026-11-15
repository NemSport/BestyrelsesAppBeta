import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { StakeholderService } from "@/services/stakeholder-service";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ stakeholderId: string; contractId: string }> },
) {
  try {
    await new StakeholderService(await createClient()).activateContract({
      ...(await request.json()),
      ...(await params),
    });
    return NextResponse.json({ activated: true });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Kontrakten kunne ikke aktiveres.",
    });
  }
}
