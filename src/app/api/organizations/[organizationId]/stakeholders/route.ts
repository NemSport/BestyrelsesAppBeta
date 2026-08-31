import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { StakeholderService } from "@/services/stakeholder-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    return NextResponse.json(
      await new StakeholderService(await createClient()).getWorkspace(
        organizationId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const stakeholder = await new StakeholderService(
      await createClient(),
    ).create({ ...(await request.json()), organizationId });
    return NextResponse.json(stakeholder, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
