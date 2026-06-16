import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DecisionService } from "@/services/decision-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const data = await new DecisionService(await createClient()).getRegister(
      (await params).organizationId,
    );
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const decision = await new DecisionService(await createClient()).create({
      ...(await request.json()),
      organizationId: (await params).organizationId,
    });
    return NextResponse.json(decision, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
