"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(
              registrations.map(async (registration) => {
                registration.active?.postMessage({
                  type: "CLEAR_OFFLINE_CACHE",
                });
                return registration.unregister();
              }),
            ),
          ),
        "caches" in window
          ? window.caches
              .keys()
              .then((keys) =>
                Promise.all(
                  keys
                    .filter((key) => key.startsWith("bestyrelsesapp-"))
                    .map((key) => window.caches.delete(key)),
                ),
              )
          : Promise.resolve([]),
      ]).catch(() => {
        // Development remains usable if a stale registration cannot be removed.
      });
      return;
    }

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
