import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { JobCardService } from "@/services/job-card-service";

function logJobCardError(
  error: unknown,
  context: { action: string; organizationId: string },
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
    organizationId: context.organizationId,
    name: record?.name,
    message: record?.message,
    code: record?.code,
    details: record?.details,
    hint: record?.hint,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  try {
    return NextResponse.json(await new JobCardService(await createClient()).create({ ...(await request.json()), organizationId }), { status: 201 });
  } catch (error) {
    logJobCardError(error, { action: "create", organizationId });
    return apiError(error);
  }
}
