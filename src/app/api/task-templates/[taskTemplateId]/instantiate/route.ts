import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { JobCardService } from "@/services/job-card-service";

export async function POST(request: Request, { params }: { params: Promise<{ taskTemplateId: string }> }) {
  const { taskTemplateId } = await params;
  try { return NextResponse.json(await new JobCardService(await createClient()).instantiateTaskTemplate({ ...(await request.json()), taskTemplateId }), { status: 201 }); }
  catch (error) { return apiError(error); }
}
