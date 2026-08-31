"use client";

import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useDialogFocus({
  active,
  containerRef,
  initialFocusRef,
  onEscape,
  returnFocusRef,
}: {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    const returnTarget =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        container?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      ).filter((element) => !element.hidden && element.offsetParent !== null);

    const initialFocusTarget = initialFocusRef?.current ?? focusables()[0] ?? container;
    initialFocusTarget?.focus();

    function isTopmostDialog() {
      const dialogs = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"]',
        ),
      ).filter((dialog) => dialog.getClientRects().length > 0);
      return dialogs.at(-1) === container;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !isTopmostDialog()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusables();
      if (elements.length === 0) {
        event.preventDefault();
        container?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!container?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [active, containerRef, initialFocusRef, returnFocusRef]);
}
