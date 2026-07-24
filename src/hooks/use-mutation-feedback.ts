"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  useEffect(() => {
    if (!dirty) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

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
