import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agendaItemId: string }> },
) {
  try {
    const occurrence = await new AgendaItemService(await createClient()).schedule({
      ...(await request.json()),
      agendaItemId: (await params).agendaItemId,
    });
    return NextResponse.json(occurrence, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
