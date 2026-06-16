const CACHE_NAME = "committee-minutes-offline-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_OFFLINE_CACHE") {
    event.waitUntil(caches.delete(CACHE_NAME));
  }
  if (event.data?.type === "CACHE_CURRENT_PAGE") {
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    event.waitUntil(
      caches.open(CACHE_NAME).then(async (cache) => {
        await Promise.all(
          urls.map(async (url) => {
            try {
              const response = await fetch(url, { credentials: "include" });
              if (response.ok) await cache.put(url, response);
            } catch {
              // Existing cached resources remain available while offline.
            }
          }),
        );
      }),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.error();
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
