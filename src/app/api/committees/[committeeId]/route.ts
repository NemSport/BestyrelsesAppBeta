import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { CommitteeService } from "@/services/committee-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const committee = await new CommitteeService(await createClient()).update({
      ...(await request.json()),
      committeeId: (await params).committeeId,
    });
    return NextResponse.json(committee);
  } catch (error) {
    return apiError(error);
  }
}
