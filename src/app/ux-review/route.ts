import { NextResponse, type NextRequest } from "next/server";

import {
  UxReviewService,
  type UxReviewFailureReason,
} from "@/services/ux-review-service";
import type { UxReviewDiagnostic } from "@/repositories/ux-review-repository";

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

    const callback = new URL("/auth/ux-review-callback", request.url);
    callback.searchParams.set("token_hash", grant.tokenHash);
    callback.searchParams.set("type", "magiclink");
    callback.searchParams.set(
      "next",
      `/organizations/${grant.organizationId}`,
    );
    callback.searchParams.set("expires", String(grant.callbackExpiresAt));
    callback.searchParams.set("signature", grant.callbackSignature);

    const response = NextResponse.redirect(callback, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
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
  diagnostic?: UxReviewDiagnostic,
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
