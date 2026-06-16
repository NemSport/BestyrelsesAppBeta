import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ occurrenceId: string }> },
) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const result = await new AgendaItemService(
      await createClient(),
    ).moveOccurrenceToTrash({
      organizationId: searchParams.get("organizationId") ?? "",
      committeeId: searchParams.get("committeeId") ?? "",
      occurrenceId: (await params).occurrenceId,
    });
    return NextResponse.json({
      ...result,
      message: "Dagsordenspunktet er fjernet fra dette møde.",
    });
  } catch (error) {
    return apiError(error);
  }
}
