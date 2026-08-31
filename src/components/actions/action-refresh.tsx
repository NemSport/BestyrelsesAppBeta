"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const MAX_TIMEOUT_MS = 2_147_000_000;

export function ActionRefresh({ nextRefreshAt }: { nextRefreshAt: string | null }) {
  const router = useRouter();
  const lastRefreshAt = useRef(0);
  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAt.current < 1_000) return;
    lastRefreshAt.current = now;
    router.refresh();
  }, [router]);

  useEffect(() => {
    const refreshOnFocus = () => refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!nextRefreshAt) return;
    const target = new Date(nextRefreshAt).getTime();
    let timeout: number | undefined;

    const schedule = () => {
      const delay = target - Date.now();
      if (delay <= 0) {
        refresh();
        return;
      }
      timeout = window.setTimeout(
        delay > MAX_TIMEOUT_MS ? schedule : refresh,
        Math.min(delay + 1_000, MAX_TIMEOUT_MS),
      );
    };

    schedule();
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [nextRefreshAt, refresh]);

  return null;
}
