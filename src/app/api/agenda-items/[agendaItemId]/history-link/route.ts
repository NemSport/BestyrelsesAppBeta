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
    const result = await new AgendaItemService(
      await createClient(),
    ).searchHistoryLinkCandidates({
      organizationId: searchParams.get("organizationId") ?? "",
      committeeId: searchParams.get("committeeId") ?? "",
      agendaItemId: (await params).agendaItemId,
      query: searchParams.get("query") ?? "",
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Dagsordenspunkterne kunne ikke indlÃ¦ses.",
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agendaItemId: string }> },
) {
  try {
    const result = await new AgendaItemService(
      await createClient(),
    ).linkToHistory({
      ...(await request.json()),
      agendaItemId: (await params).agendaItemId,
    });
    return NextResponse.json({
      agendaItem: result,
      message: "Dagsordenspunktet er knyttet til historikken.",
    });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Dagsordenspunktet kunne ikke knyttes til historikken.",
    });
  }
}
