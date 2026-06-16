import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const { committeeId } = await params;
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organisation mangler." }, { status: 422 });
    }
    return NextResponse.json(
      await new AgendaItemService(await createClient()).list(
        organizationId,
        committeeId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    const agendaItem = await new AgendaItemService(await createClient()).create({
      ...(await request.json()),
      committeeId: (await params).committeeId,
    });
    return NextResponse.json(agendaItem, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
