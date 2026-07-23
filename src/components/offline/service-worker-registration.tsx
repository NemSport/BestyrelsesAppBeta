"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (!window.location.pathname.startsWith("/organizations/")) return;
        const assetUrls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter(
            (url) =>
              url.startsWith(window.location.origin) &&
              new URL(url).pathname.startsWith("/_next/static/"),
          );
        registration.active?.postMessage({
          type: "CACHE_CURRENT_PAGE",
          urls: [window.location.href, ...assetUrls],
        });
      })
      .catch(() => {
        // The app remains fully usable if service workers are unavailable.
      });
  }, []);

  return null;
}
