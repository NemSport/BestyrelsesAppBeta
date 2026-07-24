export type NavigationIntent = {
  dirty: boolean;
  defaultPrevented: boolean;
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  href: string;
  currentHref: string;
  target?: string;
  download?: boolean;
};

export type NavigationDecision = "ignore" | "allow" | "cancel";

export function shouldGuardNavigation(intent: NavigationIntent) {
  if (
    !intent.dirty ||
    intent.defaultPrevented ||
    intent.button !== 0 ||
    intent.altKey ||
    intent.ctrlKey ||
    intent.metaKey ||
    intent.shiftKey ||
    intent.download ||
    (intent.target && intent.target !== "_self")
  ) {
    return false;
  }

  try {
    const currentUrl = new URL(intent.currentHref);
    const targetUrl = new URL(intent.href, currentUrl);

    if (
      !["http:", "https:"].includes(targetUrl.protocol) ||
      targetUrl.origin !== currentUrl.origin ||
      targetUrl.href === currentUrl.href
    ) {
      return false;
    }

    // A hash-only change does not discard the current page or its form state.
    if (
      targetUrl.pathname === currentUrl.pathname &&
      targetUrl.search === currentUrl.search
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function navigationDecision(
  intent: NavigationIntent,
  confirmed: boolean,
): NavigationDecision {
  if (!shouldGuardNavigation(intent)) return "ignore";
  return confirmed ? "allow" : "cancel";
}
