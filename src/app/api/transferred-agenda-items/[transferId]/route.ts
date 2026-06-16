import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { TransferredAgendaItemService } from "@/services/transferred-agenda-item-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ transferId: string }> },
) {
  try {
    const { transferId } = await params;
    const transfer = await new TransferredAgendaItemService(
      await createClient(),
    ).schedule({
      ...(await request.json()),
      transferId,
    });
    return NextResponse.json({
      transfer,
      message:
        transfer.status === "scheduled"
          ? "Punktet er overført til det valgte møde."
          : "Der findes ikke et kommende møde endnu. Overførslen afventer.",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ transferId: string }> },
) {
  try {
    const { transferId } = await params;
    const transfer = await new TransferredAgendaItemService(
      await createClient(),
    ).dismiss(transferId);
    return NextResponse.json({
      transfer,
      message: "Overførslen er afvist.",
    });
  } catch (error) {
    return apiError(error);
  }
}
