const CACHE_NAME = "bestyrelsesapp-v4";
const APP_ASSETS = [
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/icons/maskable-icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting()),
  );
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
              if (response.ok && !new URL(url).pathname.endsWith("/bestie")) await cache.put(url, response);
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
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/invite/") ||
    url.pathname === "/forgot-password" ||
    url.pathname === "/reset-password" ||
    url.pathname === "/ux-review"
  ) {
    return;
  }

  if (request.mode === "navigate" && url.pathname.endsWith("/bestie")) return;

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
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.error();
        }),
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json();
  if (!data?.path || !data?.tag) return;
  event.waitUntil(
    self.registration.showNotification("Bestie", {
      body: data.body,
      icon: "/icons/app-icon-192.png",
      tag: data.tag,
      data,
      actions: [{ action: "reply", title: "Svar", type: "text", placeholder: "Svar til Bestie" }],
    }).catch(() => self.registration.showNotification("Bestie", {
      body: data.body, icon: "/icons/app-icon-192.png", tag: data.tag, data,
      actions: [{ action: "reply", title: "Svar" }],
    })),
  );
});

self.addEventListener("notificationclick", (event) => {
  const { path, api, version } = event.notification.data ?? {};
  event.notification.close();
  if (typeof path !== "string" || !/^\/organizations\/[\da-f-]+\/bestie\?samtale=[\da-f-]+$/i.test(path)) return;
  event.waitUntil((async () => {
    if (event.action === "reply" && typeof event.reply === "string" && event.reply.trim() &&
        typeof api === "string" && /^\/api\/organizations\/[\da-f-]+\/bestie\/[\da-f-]+$/i.test(api)) {
      const replyId = crypto.randomUUID();
      try {
        const response = await fetch(api, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replyId, message: event.reply.trim(), version }),
        });
        if (response.ok) {
          const { thread } = await response.json();
          await self.registration.showNotification("Bestie", {
            body: thread.pending ? "Dit svar er gemt. Åbn Bestie for at se og godkende forslaget." : "Dit svar er gemt i Bestie.",
            icon: "/icons/app-icon-192.png",
            tag: event.notification.tag,
            data: { path, api, version: thread.version },
          });
          return;
        }
      } catch {
        // Open the composer if the inline reply cannot be saved.
      }
    }
    const destination = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window" });
    const existing = windows.find((client) => client.url === destination);
    if (existing) await existing.focus();
    else await self.clients.openWindow(destination);
  })());
});
