import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { BestieDispatchService } from "@/services/bestie-dispatch-service";

export const maxDuration = 30;

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/u)?.[1];
  if (!token) return new NextResponse(null, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db.rpc("bestie_fire_timed_reminders", { dispatch_token: token });
  if (error) return new NextResponse(null, { status: error.code === "42501" ? 401 : 502 });

  const dispatch = new BestieDispatchService(db);
  const results = await Promise.allSettled(data.map(({ thread_id }) => dispatch.sendToThread(thread_id)));
  if (results.some((result) => result.status === "rejected"))
    console.warn("Bestie could not dispatch some timed reminders.");
  return new NextResponse(null, { status: 204 });
}
