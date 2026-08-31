import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = process.cwd();
const serviceWorkerSource = readFileSync(`${root}/public/sw.js`, "utf8");
const registrationSource = readFileSync(
  `${root}/src/components/offline/service-worker-registration.tsx`,
  "utf8",
);

type ServiceWorkerListener = (event: {
  request: { method: string; mode: string; url: string };
  respondWith(response: Promise<Response>): void;
}) => void;

test("Next client chunks use the network before an offline cache fallback", async () => {
  const listeners = new Map<string, ServiceWorkerListener>();
  const cachedWrites: string[] = [];
  let networkRequests = 0;
  let networkAvailable = true;

  const cache = {
    addAll: async () => undefined,
    put: async (_request: unknown, response: Response) => {
      cachedWrites.push(await response.text());
    },
  };
  const cacheStorage = {
    delete: async () => true,
    keys: async () => [],
    match: async () => new Response("stale chunk"),
    open: async () => cache,
  };

  runInNewContext(serviceWorkerSource, {
    URL,
    Promise,
    Response,
    caches: cacheStorage,
    fetch: async () => {
      networkRequests += 1;
      if (!networkAvailable) throw new Error("offline");
      return new Response("fresh chunk");
    },
    self: {
      addEventListener: (type: string, listener: ServiceWorkerListener) => {
        listeners.set(type, listener);
      },
      clients: { claim: async () => undefined },
      location: { origin: "https://app.example.test" },
      skipWaiting: async () => undefined,
    },
  });

  const fetchListener = listeners.get("fetch");
  if (!fetchListener) throw new Error("Service worker did not register fetch");
  const handleFetch: ServiceWorkerListener = fetchListener;

  async function requestChunk() {
    let responsePromise: Promise<Response> | undefined;
    handleFetch({
      request: {
        method: "GET",
        mode: "cors",
        url: "https://app.example.test/_next/static/chunks/app/layout.js",
      },
      respondWith: (response) => {
        responsePromise = response;
      },
    });
    assert.ok(responsePromise);
    return responsePromise;
  }

  const freshResponse = await requestChunk();
  assert.equal(await freshResponse.text(), "fresh chunk");
  assert.equal(networkRequests, 1);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(cachedWrites, ["fresh chunk"]);

  networkAvailable = false;
  const offlineResponse = await requestChunk();
  assert.equal(await offlineResponse.text(), "stale chunk");
  assert.equal(networkRequests, 2);
});

test("development unregisters and clears existing app service-worker caches", () => {
  assert.match(serviceWorkerSource, /bestyrelsesapp-v3/);
  assert.match(registrationSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(registrationSource, /registration\.unregister\(\)/);
  assert.match(registrationSource, /key\.startsWith\("bestyrelsesapp-"\)/);
});
