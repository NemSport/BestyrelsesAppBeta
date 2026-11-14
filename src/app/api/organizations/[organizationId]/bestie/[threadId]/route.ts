import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { bestieReplySchema } from "@/lib/bestie";
import { AppError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BestieRepository } from "@/repositories/bestie-repository";
import { BestieService } from "@/services/bestie-service";

const route = z.object({
  organizationId: z.string().uuid(),
  threadId: z.string().uuid(),
});

async function load(params: Promise<unknown>) {
  const { organizationId, threadId } = route.parse(await params);
  const service = new BestieService(await createClient());
  const thread = await service.requireThread(organizationId, threadId);
  return { service, thread, writer: new BestieRepository(createAdminClient()) };
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; threadId: string }> },
) {
  try {
    const { thread, writer } = await load(params);
    await writer.markRead(thread);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Bestie kunne ikke åbne samtalen.",
    });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; threadId: string }> },
) {
  try {
    const version = z
      .string()
      .datetime({ offset: true })
      .parse(new URL(request.url).searchParams.get("version"));
    const { thread, writer } = await load(params);
    if (!(await writer.dismiss(thread, version))) {
      throw new AppError(
        "Der er kommet en ny besked i samtalen. Åbn den, og prøv igen.",
        409,
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Beskeden kunne ikke slettes. Prøv igen.",
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; threadId: string }> },
) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw new AppError("Svaret skal sendes som JSON.", 415);
    }
    const input = bestieReplySchema.parse(await request.json());
    const { service, thread, writer } = await load(params);
    return NextResponse.json({
      thread: await service.reply(thread, input, writer),
    });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Bestie kunne ikke gemme dit svar. Prøv igen.",
    });
  }
}
