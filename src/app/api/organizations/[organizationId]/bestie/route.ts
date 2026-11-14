import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation";
import { BestieService, bestieThread } from "@/services/bestie-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const organizationId = uuidSchema.parse((await params).organizationId);
    const selected = z
      .string()
      .uuid()
      .nullable()
      .parse(new URL(request.url).searchParams.get("samtale"));
    const service = new BestieService(await createClient());
    const threads = await service.list(organizationId);
    if (selected && !threads.some((thread) => thread.id === selected)) {
      const row = await service
        .requireThread(organizationId, selected)
        .catch((error: unknown) => {
          if (error instanceof NotFoundError) return null;
          throw error;
        });
      if (row && !row.dismissed_at) threads.push(bestieThread(row));
    }
    return NextResponse.json(
      { threads },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Bestie kunne ikke hente dine samtaler.",
    });
  }
}
