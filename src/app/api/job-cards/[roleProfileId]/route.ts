import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { JobCardService } from "@/services/job-card-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ roleProfileId: string }> }) {
  const { roleProfileId } = await params;
  try { return NextResponse.json(await new JobCardService(await createClient()).update({ ...(await request.json()), roleProfileId })); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ roleProfileId: string }> }) {
  const { roleProfileId } = await params;
  try { return NextResponse.json(await new JobCardService(await createClient()).archive({ ...(await request.json()), roleProfileId })); }
  catch (error) { return apiError(error); }
}
