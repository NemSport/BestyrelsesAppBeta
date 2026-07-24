"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  navigationDecision,
  shouldGuardNavigation,
  type NavigationIntent,
} from "@/lib/navigation-guard";

export type MutationFeedbackState = {
  status: "idle" | "pending" | "success" | "error";
  message: string | null;
};

const idleState: MutationFeedbackState = {
  status: "idle",
  message: null,
};

export function useMutationFeedback() {
  const lockRef = useRef(false);
  const [feedback, setFeedback] = useState<MutationFeedbackState>(idleState);

  const begin = useCallback((message = "Gemmer ændringer...") => {
    if (lockRef.current) return false;
    lockRef.current = true;
    setFeedback({ status: "pending", message });
    return true;
  }, []);

  const succeed = useCallback((message: string) => {
    lockRef.current = false;
    setFeedback({ status: "success", message });
  }, []);

  const fail = useCallback((message: string) => {
    lockRef.current = false;
    setFeedback({ status: "error", message });
  }, []);

  const reset = useCallback(() => {
    if (lockRef.current) return;
    setFeedback(idleState);
  }, []);

  return {
    feedback,
    pending: feedback.status === "pending",
    begin,
    succeed,
    fail,
    reset,
  };
}

export function useUnsavedChanges(
  dirty: boolean,
  message = "Du har ændringer, som ikke er gemt. Vil du fortsætte uden at gemme?",
) {
  const allowNextUnloadRef = useRef(false);

  useEffect(() => {
    allowNextUnloadRef.current = false;
    if (!dirty) return;

    let resetTimer: number | null = null;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (allowNextUnloadRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function guardInternalNavigation(event: MouseEvent) {
      const element =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;
      const anchor = element?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const intent: NavigationIntent = {
        dirty: true,
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        href: anchor.href,
        currentHref: window.location.href,
        target: anchor.target,
        download: anchor.hasAttribute("download"),
      };
      if (!shouldGuardNavigation(intent)) return;
      const decision = navigationDecision(intent, window.confirm(message));

      if (decision === "cancel") {
        event.preventDefault();
        return;
      }
      if (decision === "allow") {
        allowNextUnloadRef.current = true;
        resetTimer = window.setTimeout(() => {
          allowNextUnloadRef.current = false;
        }, 1_000);
      }
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", guardInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", guardInternalNavigation, true);
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      allowNextUnloadRef.current = false;
    };
  }, [dirty, message]);

  return useCallback(() => !dirty || window.confirm(message), [dirty, message]);
}

export function focusInvalidField(fieldId: string | null | undefined) {
  if (!fieldId) return;
  window.requestAnimationFrame(() => {
    const field = document.getElementById(fieldId);
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
    field?.focus({ preventScroll: true });
  });
}
