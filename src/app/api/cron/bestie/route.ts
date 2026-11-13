import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
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
    return NextResponse.json(
      await new BestieDispatchService(createAdminClient()).run(),
    );
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Besties planlagte kørsel mislykkedes.",
    });
  }
}
