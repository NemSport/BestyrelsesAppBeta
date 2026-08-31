import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemDraftAssistantService } from "@/services/agenda-item-draft-assistant-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const result = await new AgendaItemDraftAssistantService(
      await createClient(),
    ).suggest({
      ...(await request.json()),
      committeeId: (await params).committeeId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
