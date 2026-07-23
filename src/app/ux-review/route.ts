import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { UxReviewService } from "@/services/ux-review-service";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// TEMPORARY: Remove this UX review route, its environment variables, service,
// repository, and database rate-limit migration after the external UX review.
export async function GET(request: NextRequest) {
  const denied = () =>
    new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });

  try {
    const clientAddress = getClientAddress(request);
    const grant = await new UxReviewService().authorize(
      request.nextUrl.searchParams.get("token"),
      clientAddress,
    );
    if (!grant) return denied();

    const destination = new URL(
      `/organizations/${grant.organizationId}`,
      request.url,
    );
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");

    const supabase = createServerClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );
    const { data, error } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: grant.tokenHash,
    });
    if (error || data.user?.id !== grant.userId) return denied();

    return response;
  } catch {
    return denied();
  }
}

function getClientAddress(request: NextRequest) {
  const forwardedAddress = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwardedAddress || request.headers.get("x-real-ip") || "unknown";
}
