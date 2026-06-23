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

function summarizeJobCardPayload(payload: Record<string, unknown>) {
  return {
    organizationId: payload.organizationId,
    hasTitle: typeof payload.title === "string" && payload.title.trim().length > 0,
    responsibilityAreaIds: Array.isArray(payload.responsibilityAreaIds)
      ? payload.responsibilityAreaIds.length
      : "invalid",
    responsibilityAreaNames: Array.isArray(payload.responsibilityAreaNames)
      ? payload.responsibilityAreaNames.length
      : "missing",
    committeeIds: Array.isArray(payload.committeeIds)
      ? payload.committeeIds.length
      : "invalid",
    assignedUserIds: Array.isArray(payload.assignedUserIds)
      ? payload.assignedUserIds.length
      : "invalid",
    annualWheelEventIds: Array.isArray(payload.annualWheelEventIds)
      ? payload.annualWheelEventIds.length
      : "missing",
    decisionIds: Array.isArray(payload.decisionIds)
      ? payload.decisionIds.length
      : "missing",
    documents: Array.isArray(payload.documents) ? payload.documents.length : "invalid",
    taskTemplates: Array.isArray(payload.taskTemplates)
      ? payload.taskTemplates.length
      : "invalid",
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ roleProfileId: string }> }) {
  const { roleProfileId } = await params;
  try {
    const payload = await request.json();
    console.info("[job-cards] Modtog jobkort-update", {
      roleProfileId,
      payload: summarizeJobCardPayload(payload),
    });
    return NextResponse.json(await new JobCardService(await createClient()).update({ ...payload, roleProfileId }));
  }
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
