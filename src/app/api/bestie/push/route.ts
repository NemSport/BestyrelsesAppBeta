import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { bestiePushConfig, bestiePushInput } from "@/lib/bestie-push";
import { AppError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";

export async function GET() {
  try {
    const user = await new AuthService(await createClient()).requireUser();
    return NextResponse.json(
      { publicKey: bestiePushConfig()?.publicKey ?? null, userId: user.id },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await new AuthService(await createClient()).requireUser();
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw new AppError("Notifikationsindstillinger skal sendes som JSON.", 415);
    }
    const input = bestiePushInput.parse(await request.json());
    const subscriptions = createAdminClient().from("bestie_push_subscriptions");
    if (input.enabled && !bestiePushConfig()) {
      throw new AppError(
        "Besties pushnotifikationer er ikke sat op endnu.",
        503,
      );
    }
    const { error } = input.enabled
      ? await subscriptions.upsert({
          endpoint: input.endpoint,
          user_id: user.id,
          keys: input.keys,
        })
      : await subscriptions
          .delete()
          .eq("endpoint", input.endpoint)
          .eq("user_id", user.id);
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Kunne ikke ændre dine pushnotifikationer.",
    });
  }
}
