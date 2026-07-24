"use client";

import { useEffect, type RefObject } from "react";

export function useDismissibleDetails(
  detailsRef: RefObject<HTMLDetailsElement | null>,
) {
  useEffect(() => {
    const details = detailsRef.current;

    function close(returnFocus: boolean) {
      if (!details?.open) return;
      details.open = false;
      if (returnFocus) details.querySelector<HTMLElement>("summary")?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && details?.contains(document.activeElement)) {
        event.preventDefault();
        close(true);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !detailsRef.current?.contains(target)) {
        close(false);
      }
    }

    details?.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      details?.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [detailsRef]);
}
