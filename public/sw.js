/* Service worker for 렌주 마스터.
 * Goal: make the ~39MB Rapfi engine download once and work offline, while
 * keeping the app shell available without a network. */

const CACHE = "renju-master-v1";
const ENGINE_PREFIX = "/engine/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first for the large, immutable engine assets.
  if (url.pathname.startsWith(ENGINE_PREFIX)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // Only cache full (200) responses, never partial (206) range hits.
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Network-first for the app shell; fall back to cache when offline.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && (req.mode === "navigate" || url.pathname === "/")) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cache = await caches.open(CACHE);
        const hit = (await cache.match(req)) || (await cache.match("/"));
        if (hit) return hit;
        throw new Error("offline and not cached");
      }
    })(),
  );
});
