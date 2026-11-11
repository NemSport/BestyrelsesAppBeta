export const passwordRecoveryDestinationCookie = "bestyrelsesapp-recovery-next";
export const passwordRecoveryCallback = "/auth/callback";
export const passwordRecoveryCookie = "bestyrelsesapp-password-recovery";

const localOrigin = "https://bestyrelsesapp.invalid";

export function getAuthRedirect(next: unknown) {
  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    next.startsWith("//")
  ) {
    return "/organizations";
  }

  try {
    const url = new URL(next, localOrigin);
    if (url.origin === localOrigin && !url.pathname.startsWith("//")) {
      return url.pathname + url.search + url.hash;
    }
  } catch {
    // Invalid links return the user to the organization overview.
  }
  return "/organizations";
}

export function authHref(
  path: "/login" | "/signup" | "/forgot-password" | "/reset-password",
  next: string,
) {
  return next === "/organizations"
    ? path
    : `${path}?${new URLSearchParams({ next })}`;
}
