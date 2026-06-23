import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { JobCardService } from "@/services/job-card-service";

function logJobCardError(
  error: unknown,
  context: { action: string; roleProfileId: string },
) {
  const record = error as {
    name?: string;
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
  console.error("[job-cards] Jobkort-handling fejlede", {
    action: context.action,
    roleProfileId: context.roleProfileId,
    name: record?.name,
    message: record?.message,
    code: record?.code,
    details: record?.details,
    hint: record?.hint,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ roleProfileId: string }> }) {
  const { roleProfileId } = await params;
  try { return NextResponse.json(await new JobCardService(await createClient()).update({ ...(await request.json()), roleProfileId })); }
  catch (error) {
    logJobCardError(error, { action: "update", roleProfileId });
    return apiError(error);
  }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ roleProfileId: string }> }) {
  const { roleProfileId } = await params;
  try { return NextResponse.json(await new JobCardService(await createClient()).archive({ ...(await request.json()), roleProfileId })); }
  catch (error) {
    logJobCardError(error, { action: "archive", roleProfileId });
    return apiError(error);
  }
}
