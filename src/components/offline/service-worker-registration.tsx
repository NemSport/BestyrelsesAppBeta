"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").then(async () => {
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
    });
  }, []);

  return null;
}
