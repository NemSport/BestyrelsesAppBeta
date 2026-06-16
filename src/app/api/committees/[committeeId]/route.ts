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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const result = await new CommitteeService(await createClient()).moveToTrash({
      organizationId: searchParams.get("organizationId") ?? "",
      committeeId: (await params).committeeId,
    });
    return NextResponse.json({
      ...result,
      message: "Udvalget er flyttet til papirkurven.",
    });
  } catch (error) {
    return apiError(error);
  }
}
