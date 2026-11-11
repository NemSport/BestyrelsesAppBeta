import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  authHref,
  getAuthRedirect,
  passwordRecoveryCallback,
  passwordRecoveryCookie,
  passwordRecoveryDestinationCookie,
} from "@/lib/auth-navigation";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const next = getAuthRedirect(params.get("next"));
  const recoveryDestination = request.cookies.get(
    passwordRecoveryDestinationCookie,
  )?.value;
  const supabase = await createClient();
  const result = code ? await supabase.auth.exchangeCodeForSession(code) : null;
  const data = result?.data;
  const isRecovery =
    data && "redirectType" in data && data.redirectType === "recovery";
  if (isRecovery || (recoveryDestination && !data?.user)) {
    const destination = getAuthRedirect(recoveryDestination);
    if (!isRecovery || !data.user) {
      const retry = new URL(
        authHref("/forgot-password", destination),
        request.url,
      );
      retry.searchParams.set("state", "invalid");
      return NextResponse.redirect(retry);
    }
    const response = NextResponse.redirect(
      new URL(authHref("/reset-password", destination), request.url),
    );
    response.cookies.set(passwordRecoveryCookie, data.user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 600,
    });
    response.cookies.set(passwordRecoveryDestinationCookie, "", {
      path: passwordRecoveryCallback,
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  return NextResponse.redirect(new URL(next, request.url));
}
