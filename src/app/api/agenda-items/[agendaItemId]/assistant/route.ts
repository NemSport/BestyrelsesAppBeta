import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemAssistantService } from "@/services/agenda-item-assistant-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agendaItemId: string }> },
) {
  const { agendaItemId } = await params;
  try {
    const result = await new AgendaItemAssistantService(
      await createClient(),
    ).prepare({
      ...(await request.json()),
      agendaItemId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
