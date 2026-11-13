import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import {
  meetingDatePollInput,
  meetingSchedulingScope,
} from "@/lib/meeting-scheduling";
import { createClient } from "@/lib/supabase/server";
import { MeetingSchedulingService } from "@/services/meeting-scheduling-service";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }),
  z.object({ action: z.literal("send"), pollId: z.string().uuid() }),
  z.object({
    action: z.literal("finalize"),
    pollId: z.string().uuid(),
    optionIndex: z.number().int().min(1).max(12),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ committeeId: string }> },
) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return NextResponse.json(
        { error: "Ugyldig anmodning." },
        { status: 415 },
      );
    }
    const body = {
      ...(await request.json()),
      committeeId: (await params).committeeId,
    };
    const input = command.parse(body);
    const scope = meetingSchedulingScope.parse(body);
    const service = new MeetingSchedulingService(await createClient());
    switch (input.action) {
      case "create":
        return NextResponse.json(
          { pollId: await service.create(meetingDatePollInput.parse(body)) },
          { status: 201 },
        );
      case "send":
        return NextResponse.json(
          await service.sendPoll(
            scope,
            input.pollId,
            new URL(request.url).origin,
          ),
        );
      case "finalize":
        return NextResponse.json({
          meetingId: await service.finalize({ ...scope, ...input }),
        });
    }
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Datoafstemningen kunne ikke gemmes. Prøv igen.",
    });
  }
}
