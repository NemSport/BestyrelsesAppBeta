import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ agendaItemId: string }> },
) {
  try {
    const agendaItem = await new AgendaItemService(await createClient()).update({
      ...(await request.json()),
      agendaItemId: (await params).agendaItemId,
    });
    return NextResponse.json(agendaItem);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ agendaItemId: string }> },
) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const result = await new AgendaItemService(await createClient()).remove({
      organizationId: searchParams.get("organizationId") ?? "",
      committeeId: searchParams.get("committeeId") ?? "",
      agendaItemId: (await params).agendaItemId,
    });
    return NextResponse.json({
      ...result,
      message: "Dagsordenspunktet er flyttet til papirkurven.",
    });
  } catch (error) {
    return apiError(error);
  }
}
