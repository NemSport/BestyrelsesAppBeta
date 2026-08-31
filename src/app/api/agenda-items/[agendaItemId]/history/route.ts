import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agendaItemId: string }> },
) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const history = await new AgendaItemService(
      await createClient(),
    ).getAgendaItemHistory(
      searchParams.get("organizationId") ?? "",
      searchParams.get("committeeId") ?? "",
      (await params).agendaItemId,
    );
    return NextResponse.json(history);
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Historikken kunne ikke indlÃ¦ses.",
    });
  }
}
