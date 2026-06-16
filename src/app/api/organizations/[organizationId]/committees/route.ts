import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { CommitteeService } from "@/services/committee-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    return NextResponse.json(
      await new CommitteeService(await createClient()).list(organizationId),
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
    const committee = await new CommitteeService(await createClient()).create({
      ...(await request.json()),
      organizationId,
    });
    return NextResponse.json(committee, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
