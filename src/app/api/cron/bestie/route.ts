import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { BestieAgendaDispatchService } from "@/services/bestie-agenda-dispatch-service";
import { BestieDispatchService } from "@/services/bestie-dispatch-service";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    header.length !== expected.length ||
    !timingSafeEqual(header, expected)
  ) {
    return new NextResponse(null, { status: 401 });
  }
  try {
    const db = createAdminClient();
    const [messages, agendas] = await Promise.allSettled([
      new BestieDispatchService(db).run(),
      new BestieAgendaDispatchService(db).run(),
    ]);
    if (messages.status === "rejected") throw messages.reason;
    if (agendas.status === "rejected") {
      console.warn("Bestie could not start preparing agenda reminders.");
    }
    return NextResponse.json({
      ...messages.value,
      agendas: agendas.status === "fulfilled" ? agendas.value : null,
    });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Besties planlagte kørsel mislykkedes.",
    });
  }
}
