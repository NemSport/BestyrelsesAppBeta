import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUxReviewEnv } from "@/lib/server-env";
import {
  UxReviewRepository,
  type UxReviewDiagnostic,
} from "@/repositories/ux-review-repository";
import {
  isValidUxReviewCallbackGrant,
  type UxReviewFailureReason,
} from "@/services/ux-review-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_PATH =
  /^\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

// TEMPORARY: Remove this callback together with the UX review route after the
// external UX review. It must never be enabled in production.
export async function GET(request: NextRequest) {
  const denied = () =>
    new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  const environment = getUxReviewEnv();
  if (!environment.ok) {
    logUxReviewCallbackDiagnostic(
      "environment-validation",
      environment.reason,
    );
    return denied();
  }

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = request.nextUrl.searchParams.get("next");
  const expiresAt = Number(request.nextUrl.searchParams.get("expires"));
  const signature = request.nextUrl.searchParams.get("signature");
  const organizationMatch = next?.match(ORGANIZATION_PATH);
  const organizationId = organizationMatch?.[1];

  if (
    !tokenHash ||
    !signature ||
    type !== "magiclink" ||
    !next ||
    !organizationId
  ) {
    logUxReviewCallbackDiagnostic("callback-validation", "token-missing");
    return denied();
  }
  if (
    !isValidUxReviewCallbackGrant(
      {
        expiresAt,
        organizationId,
        signature,
        tokenHash,
      },
      environment.value.UX_REVIEW_TOKEN,
    )
  ) {
    logUxReviewCallbackDiagnostic("callback-validation", "token-mismatch");
    return denied();
  }

  let supabase: Awaited<ReturnType<typeof createClient>> | undefined;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    const user = data.user;
    if (
      error ||
      !data.session ||
      !user ||
      !user.email_confirmed_at ||
      user.role !== "authenticated" ||
      isCurrentlyBanned(user) ||
      user.email?.trim().toLowerCase() !==
        environment.value.UX_REVIEW_USER_EMAIL.trim().toLowerCase()
    ) {
      await supabase.auth.signOut({ scope: "local" });
      logUxReviewCallbackDiagnostic(
        "session-creation",
        "session-cookie-failed",
      );
      return denied();
    }

    const repository = new UxReviewRepository(createAdminClient());
    const restrictedAccess = await repository.findRestrictedAccess(user.id);
    if (
      !restrictedAccess.ok ||
      restrictedAccess.organizationId !== organizationId
    ) {
      await supabase.auth.signOut({ scope: "local" });
      logUxReviewCallbackDiagnostic(
        "membership-validation",
        restrictedAccess.ok
          ? "invalid-organization-membership"
          : restrictedAccess.reason,
        restrictedAccess.ok ? undefined : restrictedAccess.diagnostic,
      );
      return denied();
    }

    const cookieStore = await cookies();
    const hasSessionCookie = cookieStore
      .getAll()
      .some((cookie) => cookie.name.includes("-auth-token"));
    if (!hasSessionCookie) {
      await supabase.auth.signOut({ scope: "local" });
      logUxReviewCallbackDiagnostic(
        "session-creation",
        "session-cookie-failed",
      );
      return denied();
    }

    const response = NextResponse.redirect(new URL(next, request.url), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    if (supabase) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // The browser still receives an empty 404 if local cookie cleanup fails.
      }
    }
    logUxReviewCallbackDiagnostic(
      "session-creation",
      "supabase-operation-failed",
    );
    return denied();
  }
}

function logUxReviewCallbackDiagnostic(
  stage: string,
  reason: UxReviewFailureReason | "session-cookie-failed",
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
    ...(diagnostic ?? {}),
  });
}

function isCurrentlyBanned(user: { banned_until?: string }) {
  if (!user.banned_until) return false;
  return new Date(user.banned_until).getTime() > Date.now();
}
