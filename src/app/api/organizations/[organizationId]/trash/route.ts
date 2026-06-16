import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { TrashService } from "@/services/trash-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const result = await new TrashService(await createClient()).restore({
      ...(await request.json()),
      organizationId,
    });
    return NextResponse.json({
      item: result,
      message: "Elementet er gendannet.",
    });
  } catch (error) {
    return apiError(error);
  }
}
