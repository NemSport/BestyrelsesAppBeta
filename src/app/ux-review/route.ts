import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import {
  UxReviewService,
  type UxReviewFailureReason,
} from "@/services/ux-review-service";
import type { UxReviewRateLimitDiagnostic } from "@/repositories/ux-review-repository";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// TEMPORARY: Remove this UX review route, its environment variables, service,
// repository, and database rate-limit migration after the external UX review.
export async function GET(request: NextRequest) {
  const requestToken = request.nextUrl.searchParams.get("token");
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
    const authorization = await new UxReviewService().authorize(
      requestToken,
      clientAddress,
    );
    if (!authorization.ok) {
      logUxReviewDiagnostic(
        authorization.stage,
        authorization.reason,
        requestToken,
        authorization.diagnostic,
      );
      return denied();
    }
    const { grant } = authorization;

    const destination = new URL(
      `/organizations/${grant.organizationId}`,
      request.url,
    );
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");

    try {
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
      const hasSessionCookie = response.cookies
        .getAll()
        .some((cookie) => cookie.name.includes("-auth-token"));
      if (
        error ||
        !data.session ||
        data.user?.id !== grant.userId ||
        !hasSessionCookie
      ) {
        logUxReviewDiagnostic(
          "session-creation",
          "session-cookie-failed",
          requestToken,
        );
        return denied();
      }
    } catch {
      logUxReviewDiagnostic(
        "session-creation",
        "session-cookie-failed",
        requestToken,
      );
      return denied();
    }

    return response;
  } catch {
    logUxReviewDiagnostic(
      "request-processing",
      "supabase-operation-failed",
      requestToken,
    );
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

function logUxReviewDiagnostic(
  stage: string,
  reason: UxReviewFailureReason | "session-cookie-failed",
  requestToken: string | null,
  diagnostic?: UxReviewRateLimitDiagnostic,
) {
  console.error("[ux-review]", {
    stage,
    reason,
    vercelEnv: process.env.VERCEL_ENV,
    hasEnabled: Boolean(process.env.UX_REVIEW_ENABLED),
    hasToken: Boolean(process.env.UX_REVIEW_TOKEN),
    hasUserEmail: Boolean(process.env.UX_REVIEW_USER_EMAIL),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    requestTokenLength: requestToken?.length ?? 0,
    configuredTokenLength: process.env.UX_REVIEW_TOKEN?.length ?? 0,
    ...(diagnostic ?? {}),
  });
}
