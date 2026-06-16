import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { JobCardService } from "@/services/job-card-service";

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  try { return NextResponse.json(await new JobCardService(await createClient()).createResponsibilityArea({ ...(await request.json()), organizationId }), { status: 201 }); }
  catch (error) { return apiError(error); }
}
